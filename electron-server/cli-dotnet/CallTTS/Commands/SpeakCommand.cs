using System.CommandLine;
using System.CommandLine.Invocation;
using CallTTS.Configuration;
using CallTTS.Infrastructure;
using CallTTS.Menu;
using CallTTS.Services;

namespace CallTTS.Commands;

internal sealed class SpeakCommand
{
    public static RootCommand Create()
    {
        var rootCommand = new RootCommand("CallTTS - OpenVoiceProxy CLI for text-to-speech conversion");

        foreach (var option in GlobalOptions.All)
        {
            rootCommand.AddOption(option);
        }

        rootCommand.SetHandler(ExecuteAsync);
        return rootCommand;
    }

    private static async Task<int> ExecuteAsync(InvocationContext context)
    {
        var interactive = context.ParseResult.GetValueForOption(GlobalOptions.Interactive);
        var text = context.ParseResult.GetValueForOption(GlobalOptions.Text);
        var configPath = context.ParseResult.GetValueForOption(GlobalOptions.ConfigPath);
        var outputPath = context.ParseResult.GetValueForOption(GlobalOptions.OutputPath);
        var serverUrl = context.ParseResult.GetValueForOption(GlobalOptions.ServerUrl);
        var apiKey = context.ParseResult.GetValueForOption(GlobalOptions.ApiKey);
        var engine = context.ParseResult.GetValueForOption(GlobalOptions.Engine);
        var voice = context.ParseResult.GetValueForOption(GlobalOptions.Voice);
        var format = context.ParseResult.GetValueForOption(GlobalOptions.Format);
        var sampleRate = context.ParseResult.GetValueForOption(GlobalOptions.SampleRate);
        var noPlay = context.ParseResult.GetValueForOption(GlobalOptions.NoPlay);
        var logLevel = context.ParseResult.GetValueForOption(GlobalOptions.LogLevel);

        // Load config
        var config = ConfigLoader.Load(configPath);
        ApplyOverrides(config, serverUrl, apiKey, engine, voice, format, sampleRate, outputPath, noPlay);

        var log = new Logger(config.Output.LogFile, logLevel ?? "info");

        // Auto-launch interactive menu if no arguments or explicit -i flag
        if (interactive || (string.IsNullOrWhiteSpace(text) && !config.Input.UseClipboard))
        {
            var menu = new InteractiveMenu(config, log);
            return await menu.RunAsync();
        }

        // Get text from argument or clipboard
        string? inputText = text;
        if (string.IsNullOrWhiteSpace(inputText) && config.Input.UseClipboard)
        {
            log.Info("No --text provided, reading from clipboard...");
            var clipboard = new ClipboardService();
            inputText = clipboard.GetText();
            if (!string.IsNullOrWhiteSpace(inputText))
            {
                log.Info($"Read {inputText.Length} characters from clipboard");
            }
        }

        if (string.IsNullOrWhiteSpace(inputText))
        {
            log.Error("No text provided. Use --text, enable clipboard in config, or run with -i for interactive mode.");
            return 1;
        }

        var retryCount = 0;
        const int maxRetries = 3;

        while (retryCount < maxRetries)
        {
            try
            {
                var ttsClient = new WebSocketTtsClient(log);
                var audio = await ttsClient.GenerateSpeechAsync(config, inputText, context.GetCancellationToken());

                if (config.Output.SaveToFile && !string.IsNullOrWhiteSpace(config.Output.OutputPath))
                {
                    var fullOutputPath = Path.GetFullPath(config.Output.OutputPath);
                    Directory.CreateDirectory(Path.GetDirectoryName(fullOutputPath) ?? ".");
                    File.WriteAllBytes(fullOutputPath, audio);
                    log.Info($"Audio saved to {fullOutputPath}");
                }

                if (config.Output.PlayAudio)
                {
                    var player = new NAudioPlayer(log);
                    player.Play(audio, config.Tts.Format, config.Tts.SampleRate);
                }

                log.Info("TTS generation completed successfully");
                return 0;
            }
            catch (Exception ex) when (IsApiKeyError(ex) && retryCount < maxRetries - 1)
            {
                log.Error($"Authentication failed: {ex.Message}");
                Console.Write("Enter API key (or press Enter to cancel): ");
                var newApiKey = ReadSecretLine();

                if (string.IsNullOrWhiteSpace(newApiKey))
                {
                    log.Error("No API key provided. Aborting.");
                    return 1;
                }

                config.Server.ApiKey = newApiKey;
                retryCount++;
                log.Info("Retrying with new API key...");
            }
            catch (Exception ex)
            {
                log.Error($"TTS generation failed: {ex.Message}");
                return 1;
            }
        }

        log.Error("Maximum retry attempts reached.");
        return 1;
    }

    private static void ApplyOverrides(
        AppConfig config,
        string? serverUrl,
        string? apiKey,
        string? engine,
        string? voice,
        string? format,
        int? sampleRate,
        string? outputPath,
        bool noPlay)
    {
        if (!string.IsNullOrWhiteSpace(serverUrl))
        {
            config.Server.Url = serverUrl;
        }

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            config.Server.ApiKey = apiKey;
        }

        if (!string.IsNullOrWhiteSpace(engine))
        {
            config.Tts.Engine = engine;
        }

        if (!string.IsNullOrWhiteSpace(voice))
        {
            config.Tts.Voice = voice;
        }

        if (!string.IsNullOrWhiteSpace(format))
        {
            config.Tts.Format = format;
        }

        if (sampleRate.HasValue)
        {
            config.Tts.SampleRate = sampleRate.Value;
        }

        if (!string.IsNullOrWhiteSpace(outputPath))
        {
            config.Output.SaveToFile = true;
            config.Output.OutputPath = outputPath;
        }

        if (noPlay)
        {
            config.Output.PlayAudio = false;
        }
    }

    private static bool IsApiKeyError(Exception ex)
    {
        var message = ex.Message.ToLowerInvariant();
        return message.Contains("api key") ||
               message.Contains("apikey") ||
               message.Contains("authentication") ||
               message.Contains("unauthorized") ||
               message.Contains("auth") ||
               message.Contains("invalid key");
    }

    private static string ReadSecretLine()
    {
        // Check if we can use interactive console input
        if (!Console.IsInputRedirected && !Console.IsOutputRedirected)
        {
            try
            {
                var input = new System.Text.StringBuilder();
                while (true)
                {
                    var key = Console.ReadKey(intercept: true);
                    if (key.Key == ConsoleKey.Enter)
                    {
                        Console.WriteLine();
                        break;
                    }
                    if (key.Key == ConsoleKey.Backspace && input.Length > 0)
                    {
                        input.Length--;
                        Console.Write("\b \b");
                    }
                    else if (!char.IsControl(key.KeyChar))
                    {
                        input.Append(key.KeyChar);
                        Console.Write('*');
                    }
                }
                return input.ToString();
            }
            catch (InvalidOperationException)
            {
                // Fall through to ReadLine
            }
        }

        // Fallback for non-interactive scenarios
        return Console.ReadLine() ?? string.Empty;
    }
}
