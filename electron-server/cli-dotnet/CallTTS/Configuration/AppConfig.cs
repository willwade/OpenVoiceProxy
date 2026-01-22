using CallTTS.Configuration.ConfigSections;

namespace CallTTS.Configuration;

internal sealed class AppConfig
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
