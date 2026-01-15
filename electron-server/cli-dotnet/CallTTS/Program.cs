using System.Diagnostics;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using TextCopy;

internal sealed class Program
{
    private const string AppName = "OpenVoiceProxy";
    private const string CliName = "CallTTS";
    private const int DefaultTimeoutSeconds = 30;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private static readonly JsonSerializerOptions JsonReadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static async Task<int> Main(string[] args)
    {
        if (args.Contains("--help") || args.Contains("-h"))
        {
            PrintHelp();
            return 0;
        }

        if (args.Contains("--version"))
        {
            Console.WriteLine("CallTTS 1.0.0");
            return 0;
        }

        var options = CliOptions.Parse(args);
        var config = ConfigLoader.Load(options.ConfigPath);
        ApplyOverrides(config, options);

        var log = new Logger(config.Output.LogFile, options.LogLevel ?? "info");

        string? text = options.Text;
        if (string.IsNullOrWhiteSpace(text) && config.Input.UseClipboard)
        {
            log.Info("No --text provided, reading from clipboard...");
            text = ClipboardService.GetText();
            if (!string.IsNullOrWhiteSpace(text))
            {
                log.Info($"Read {text.Length} characters from clipboard");
            }
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            log.Error("No text provided. Use --text or enable clipboard in config.");
            return 1;
        }

        try
        {
            var audio = await GenerateSpeechAsync(config, text, log);

            if (config.Output.SaveToFile && !string.IsNullOrWhiteSpace(config.Output.OutputPath))
            {
                var outputPath = Path.GetFullPath(config.Output.OutputPath);
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
                File.WriteAllBytes(outputPath, audio);
                log.Info($"Audio saved to {outputPath}");
            }

            if (config.Output.PlayAudio)
            {
                PlayAudio(audio, config.Tts.Format, log);
            }

            log.Info("TTS generation completed successfully");
            return 0;
        }
        catch (Exception ex)
        {
            log.Error($"TTS generation failed: {ex.Message}");
            return 1;
        }
    }

    private static void ApplyOverrides(AppConfig config, CliOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.ServerUrl))
        {
            config.Server.Url = options.ServerUrl;
        }

        if (!string.IsNullOrWhiteSpace(options.ApiKey))
        {
            config.Server.ApiKey = options.ApiKey;
        }

        if (!string.IsNullOrWhiteSpace(options.Engine))
        {
            config.Tts.Engine = options.Engine;
        }

        if (!string.IsNullOrWhiteSpace(options.Voice))
        {
            config.Tts.Voice = options.Voice;
        }

        if (!string.IsNullOrWhiteSpace(options.Format))
        {
            config.Tts.Format = options.Format;
        }

        if (options.SampleRate.HasValue)
        {
            config.Tts.SampleRate = options.SampleRate.Value;
        }

        if (!string.IsNullOrWhiteSpace(options.OutputPath))
        {
            config.Output.SaveToFile = true;
            config.Output.OutputPath = options.OutputPath;
        }

        if (options.PlayAudio.HasValue)
        {
            config.Output.PlayAudio = options.PlayAudio.Value;
        }
    }

    private static async Task<byte[]> GenerateSpeechAsync(AppConfig config, string text, Logger log)
    {
        var wsUrl = AppendApiKey(config.Server.Url, config.Server.ApiKey);
        using var ws = new ClientWebSocket();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(DefaultTimeoutSeconds));

        log.Info($"Connecting to {wsUrl}");
        await ws.ConnectAsync(new Uri(wsUrl), cts.Token);

        var payload = new Dictionary<string, object?>
        {
            ["type"] = "speak",
            ["text"] = text,
            ["engine"] = config.Tts.Engine,
            ["voice"] = config.Tts.Voice,
            ["format"] = config.Tts.Format,
            ["sample_rate"] = config.Tts.SampleRate,
        };

        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload);
        await ws.SendAsync(payloadBytes, WebSocketMessageType.Text, true, cts.Token);

        var audioStream = new MemoryStream();
        var started = false;

        while (ws.State == WebSocketState.Open)
        {
            var message = await ReceiveMessageAsync(ws, cts.Token);
            if (message.MessageType == WebSocketMessageType.Close)
            {
                break;
            }

            if (message.MessageType == WebSocketMessageType.Text)
            {
                var type = GetMessageType(message.TextPayload, out var errorMessage);
                if (!string.IsNullOrWhiteSpace(errorMessage))
                {
                    throw new InvalidOperationException(errorMessage);
                }

                if (type == "meta")
                {
                    started = true;
                    log.Info("Started receiving audio data");
                }
                else if (type == "end")
                {
                    break;
                }
            }
            else if (message.MessageType == WebSocketMessageType.Binary)
            {
                started = true;
                audioStream.Write(message.BinaryPayload, 0, message.BinaryPayload.Length);
            }
        }

        if (!started)
        {
            throw new InvalidOperationException("WebSocket closed before receiving audio");
        }

        return audioStream.ToArray();
    }

    private static string AppendApiKey(string url, string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return url;
        }

        return url.Contains('?')
            ? $"{url}&api_key={apiKey}"
            : $"{url}?api_key={apiKey}";
    }

    private static string? GetMessageType(string json, out string? errorMessage)
    {
        errorMessage = null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var errorProp))
            {
                errorMessage = $"Server error: {errorProp.GetString()}";
                return null;
            }

            if (doc.RootElement.TryGetProperty("message", out var messageProp) &&
                doc.RootElement.TryGetProperty("code", out var codeProp) &&
                codeProp.GetString() == "ERROR")
            {
                errorMessage = messageProp.GetString();
                return null;
            }

            if (doc.RootElement.TryGetProperty("type", out var typeProp))
            {
                return typeProp.GetString();
            }
        }
        catch
        {
            // Ignore malformed JSON
        }

        return null;
    }

    private static async Task<WsMessage> ReceiveMessageAsync(ClientWebSocket ws, CancellationToken token)
    {
        var buffer = new byte[64 * 1024];
        using var payload = new MemoryStream();
        WebSocketReceiveResult? result;

        do
        {
            result = await ws.ReceiveAsync(buffer, token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return WsMessage.Close();
            }

            payload.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);

        if (result.MessageType == WebSocketMessageType.Text)
        {
            return WsMessage.Text(Encoding.UTF8.GetString(payload.ToArray()));
        }

        return WsMessage.Binary(payload.ToArray());
    }

    private static void PlayAudio(byte[] audio, string format, Logger log)
    {
        var extension = FormatToExtension(format);
        var tempFile = Path.Combine(Path.GetTempPath(), $"calltts-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{extension}");

        try
        {
            File.WriteAllBytes(tempFile, audio);

            var startInfo = new ProcessStartInfo
            {
                FileName = tempFile,
                UseShellExecute = true,
            };
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            log.Warn($"Failed to play audio: {ex.Message}");
        }
        finally
        {
            try
            {
                File.Delete(tempFile);
            }
            catch
            {
                // Ignore cleanup errors
            }
        }
    }

    private static string FormatToExtension(string format)
    {
        return format.ToLowerInvariant() switch
        {
            "wav" => "wav",
            "mp3" => "mp3",
            "pcm16" => "pcm",
            _ => "wav",
        };
    }

    private static void PrintHelp()
    {
        Console.WriteLine("CallTTS - OpenVoiceProxy CLI");
        Console.WriteLine("");
        Console.WriteLine("Usage: CallTTS.exe [options]");
        Console.WriteLine("");
        Console.WriteLine("Options:");
        Console.WriteLine("  -t, --text <text>       Text to convert to speech");
        Console.WriteLine("  -c, --config <path>     Path to configuration file");
        Console.WriteLine("  -o, --output <path>     Output file path for audio");
        Console.WriteLine("  --server <url>          WebSocket server URL");
        Console.WriteLine("  --api-key <key>         API key for authentication");
        Console.WriteLine("  --engine <name>         TTS engine to use");
        Console.WriteLine("  --voice <id>            Voice ID to use");
        Console.WriteLine("  --format <type>         Audio format (wav, mp3, pcm16)");
        Console.WriteLine("  --sample-rate <rate>    Sample rate in Hz");
        Console.WriteLine("  --no-play               Do not play audio after generation");
        Console.WriteLine("  --log-level <level>     Logging level (error, warn, info, debug)");
        Console.WriteLine("  -h, --help              Show this help");
    }

    private sealed record WsMessage(WebSocketMessageType MessageType, string TextPayload, byte[] BinaryPayload)
    {
        public static WsMessage Text(string text) => new(WebSocketMessageType.Text, text, Array.Empty<byte>());
        public static WsMessage Binary(byte[] data) => new(WebSocketMessageType.Binary, string.Empty, data);
        public static WsMessage Close() => new(WebSocketMessageType.Close, string.Empty, Array.Empty<byte>());
    }

    private sealed class CliOptions
    {
        public string? Text { get; set; }
        public string? ConfigPath { get; set; }
        public string? OutputPath { get; set; }
        public string? ServerUrl { get; set; }
        public string? ApiKey { get; set; }
        public string? Engine { get; set; }
        public string? Voice { get; set; }
        public string? Format { get; set; }
        public int? SampleRate { get; set; }
        public bool? PlayAudio { get; set; }
        public string? LogLevel { get; set; }

        public static CliOptions Parse(string[] args)
        {
            var options = new CliOptions();
            for (var i = 0; i < args.Length; i++)
            {
                var arg = args[i];
                switch (arg)
                {
                    case "-t":
                    case "--text":
                        options.Text = NextValue(args, ref i);
                        break;
                    case "-c":
                    case "--config":
                        options.ConfigPath = NextValue(args, ref i);
                        break;
                    case "-o":
                    case "--output":
                        options.OutputPath = NextValue(args, ref i);
                        break;
                    case "--server":
                        options.ServerUrl = NextValue(args, ref i);
                        break;
                    case "--api-key":
                        options.ApiKey = NextValue(args, ref i);
                        break;
                    case "--engine":
                        options.Engine = NextValue(args, ref i);
                        break;
                    case "--voice":
                        options.Voice = NextValue(args, ref i);
                        break;
                    case "--format":
                        options.Format = NextValue(args, ref i);
                        break;
                    case "--sample-rate":
                        if (int.TryParse(NextValue(args, ref i), out var rate))
                        {
                            options.SampleRate = rate;
                        }
                        break;
                    case "--no-play":
                        options.PlayAudio = false;
                        break;
                    case "--log-level":
                        options.LogLevel = NextValue(args, ref i);
                        break;
                }
            }

            return options;
        }

        private static string NextValue(string[] args, ref int index)
        {
            if (index + 1 >= args.Length)
            {
                return string.Empty;
            }
            index++;
            return args[index];
        }
    }

    private static class ConfigLoader
    {
        public static AppConfig Load(string? path)
        {
            var resolvedPath = string.IsNullOrWhiteSpace(path)
                ? GetDefaultConfigPath()
                : Path.GetFullPath(path);

            var config = AppConfig.CreateDefault();
            var isDefaultPath = string.Equals(resolvedPath, GetDefaultConfigPath(), StringComparison.OrdinalIgnoreCase);

            if (isDefaultPath)
            {
                var dir = Path.GetDirectoryName(resolvedPath);
                if (!string.IsNullOrWhiteSpace(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                if (!File.Exists(resolvedPath))
                {
                    File.WriteAllText(resolvedPath, JsonSerializer.Serialize(config, JsonOptions));
                    return config;
                }
            }

            if (!File.Exists(resolvedPath))
            {
                return config;
            }

            try
            {
                var json = File.ReadAllText(resolvedPath);
                var fileConfig = JsonSerializer.Deserialize<ConfigFile>(json, JsonReadOptions);
                if (fileConfig != null)
                {
                    config.Apply(fileConfig);
                }
            }
            catch
            {
                // Ignore invalid config and use defaults
            }

            return config;
        }

        private static string GetDefaultConfigPath()
        {
            var baseDir = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
                ? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
                : RuntimeInformation.IsOSPlatform(OSPlatform.OSX)
                    ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "Library", "Application Support")
                    : Environment.GetEnvironmentVariable("XDG_CONFIG_HOME") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), ".config");

            return Path.Combine(baseDir, AppName, CliName, "config.json");
        }
    }

    private sealed class Logger
    {
        private readonly string? _logFile;
        private readonly int _level;

        public Logger(string? logFile, string level)
        {
            _logFile = logFile;
            _level = level switch
            {
                "error" => 0,
                "warn" => 1,
                "info" => 2,
                "debug" => 3,
                _ => 2
            };
        }

        public void Error(string message) => Log("ERROR", 0, message);
        public void Warn(string message) => Log("WARN", 1, message);
        public void Info(string message) => Log("INFO", 2, message);
        public void Debug(string message) => Log("DEBUG", 3, message);

        private void Log(string level, int levelValue, string message)
        {
            if (levelValue > _level)
            {
                return;
            }

            var timestamp = DateTimeOffset.UtcNow.ToString("O");
            var line = $"[{timestamp}] {level}: {message}";
            Console.WriteLine($"{level}: {message}");

            if (string.IsNullOrWhiteSpace(_logFile))
            {
                return;
            }

            try
            {
                var dir = Path.GetDirectoryName(_logFile);
                if (!string.IsNullOrWhiteSpace(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                File.AppendAllText(_logFile, line + Environment.NewLine);
            }
            catch
            {
                // Ignore logging failures
            }
        }
    }

    private sealed class AppConfig
    {
        public ServerConfig Server { get; set; } = new();
        public TtsConfig Tts { get; set; } = new();
        public TranslationConfig Translation { get; set; } = new();
        public InputConfig Input { get; set; } = new();
        public OutputConfig Output { get; set; } = new();

        public static AppConfig CreateDefault() => new()
        {
            Server = new ServerConfig
            {
                Url = "ws://localhost:3000/ws",
                ApiKey = "dev"
            },
            Tts = new TtsConfig
            {
                Engine = "azure",
                Voice = "en-US-JennyNeural",
                Format = "wav",
                SampleRate = 24000
            },
            Translation = new TranslationConfig
            {
                Enabled = false,
                Provider = "google",
                ApiKey = string.Empty,
                SourceLanguage = "auto",
                TargetLanguage = "en",
                Transliteration = new TransliterationConfig
                {
                    Enabled = false,
                    FromScript = "Latn",
                    ToScript = "Arab"
                }
            },
            Input = new InputConfig
            {
                UseClipboard = true,
                OverwriteClipboardOnCompletion = false
            },
            Output = new OutputConfig
            {
                PlayAudio = true,
                SaveToFile = false,
                LogFile = "calltts.log"
            }
        };

        public void Apply(ConfigFile file)
        {
            if (file.Server?.Url != null)
            {
                Server.Url = file.Server.Url;
            }
            if (file.Server?.ApiKey != null)
            {
                Server.ApiKey = file.Server.ApiKey;
            }

            if (file.Tts?.Engine != null)
            {
                Tts.Engine = file.Tts.Engine;
            }
            if (file.Tts?.Voice != null)
            {
                Tts.Voice = file.Tts.Voice;
            }
            if (file.Tts?.Format != null)
            {
                Tts.Format = file.Tts.Format;
            }
            if (file.Tts?.SampleRate != null)
            {
                Tts.SampleRate = file.Tts.SampleRate.Value;
            }

            if (file.Translation?.Enabled != null)
            {
                Translation.Enabled = file.Translation.Enabled.Value;
            }
            if (file.Translation?.Provider != null)
            {
                Translation.Provider = file.Translation.Provider;
            }
            if (file.Translation?.ApiKey != null)
            {
                Translation.ApiKey = file.Translation.ApiKey;
            }
            if (file.Translation?.SourceLanguage != null)
            {
                Translation.SourceLanguage = file.Translation.SourceLanguage;
            }
            if (file.Translation?.TargetLanguage != null)
            {
                Translation.TargetLanguage = file.Translation.TargetLanguage;
            }
            if (file.Translation?.Transliteration?.Enabled != null)
            {
                Translation.Transliteration.Enabled = file.Translation.Transliteration.Enabled.Value;
            }
            if (file.Translation?.Transliteration?.FromScript != null)
            {
                Translation.Transliteration.FromScript = file.Translation.Transliteration.FromScript;
            }
            if (file.Translation?.Transliteration?.ToScript != null)
            {
                Translation.Transliteration.ToScript = file.Translation.Transliteration.ToScript;
            }

            if (file.Input?.UseClipboard != null)
            {
                Input.UseClipboard = file.Input.UseClipboard.Value;
            }
            if (file.Input?.OverwriteClipboardOnCompletion != null)
            {
                Input.OverwriteClipboardOnCompletion = file.Input.OverwriteClipboardOnCompletion.Value;
            }

            if (file.Output?.PlayAudio != null)
            {
                Output.PlayAudio = file.Output.PlayAudio.Value;
            }
            if (file.Output?.SaveToFile != null)
            {
                Output.SaveToFile = file.Output.SaveToFile.Value;
            }
            if (file.Output?.OutputPath != null)
            {
                Output.OutputPath = file.Output.OutputPath;
            }
            if (file.Output?.LogFile != null)
            {
                Output.LogFile = file.Output.LogFile;
            }
        }
    }

    private sealed class ServerConfig
    {
        public string Url { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
    }

    private sealed class TtsConfig
    {
        public string Engine { get; set; } = string.Empty;
        public string Voice { get; set; } = string.Empty;
        public string Format { get; set; } = string.Empty;
        public int SampleRate { get; set; }
    }

    private sealed class TranslationConfig
    {
        public bool Enabled { get; set; }
        public string Provider { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public string SourceLanguage { get; set; } = string.Empty;
        public string TargetLanguage { get; set; } = string.Empty;
        public TransliterationConfig Transliteration { get; set; } = new();
    }

    private sealed class TransliterationConfig
    {
        public bool Enabled { get; set; }
        public string FromScript { get; set; } = string.Empty;
        public string ToScript { get; set; } = string.Empty;
    }

    private sealed class InputConfig
    {
        public bool UseClipboard { get; set; }
        public bool OverwriteClipboardOnCompletion { get; set; }
    }

    private sealed class OutputConfig
    {
        public bool PlayAudio { get; set; }
        public bool SaveToFile { get; set; }
        public string? OutputPath { get; set; }
        public string? LogFile { get; set; }
    }

    private sealed class ConfigFile
    {
        public ServerConfigFile? Server { get; set; }
        public TtsConfigFile? Tts { get; set; }
        public TranslationConfigFile? Translation { get; set; }
        public InputConfigFile? Input { get; set; }
        public OutputConfigFile? Output { get; set; }
    }

    private sealed class ServerConfigFile
    {
        public string? Url { get; set; }
        public string? ApiKey { get; set; }
    }

    private sealed class TtsConfigFile
    {
        public string? Engine { get; set; }
        public string? Voice { get; set; }
        public string? Format { get; set; }
        public int? SampleRate { get; set; }
    }

    private sealed class TranslationConfigFile
    {
        public bool? Enabled { get; set; }
        public string? Provider { get; set; }
        public string? ApiKey { get; set; }
        public string? SourceLanguage { get; set; }
        public string? TargetLanguage { get; set; }
        public TransliterationConfigFile? Transliteration { get; set; }
    }

    private sealed class TransliterationConfigFile
    {
        public bool? Enabled { get; set; }
        public string? FromScript { get; set; }
        public string? ToScript { get; set; }
    }

    private sealed class InputConfigFile
    {
        public bool? UseClipboard { get; set; }
        public bool? OverwriteClipboardOnCompletion { get; set; }
    }

    private sealed class OutputConfigFile
    {
        public bool? PlayAudio { get; set; }
        public bool? SaveToFile { get; set; }
        public string? OutputPath { get; set; }
        public string? LogFile { get; set; }
    }
}
