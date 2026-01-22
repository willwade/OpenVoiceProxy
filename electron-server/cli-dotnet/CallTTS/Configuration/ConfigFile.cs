namespace CallTTS.Configuration;

/// <summary>
/// JSON deserialization models for config file (all nullable for partial configs).
/// </summary>
internal sealed class ConfigFile
{
    public ServerConfigFile? Server { get; set; }
    public TtsConfigFile? Tts { get; set; }
    public TranslationConfigFile? Translation { get; set; }
    public InputConfigFile? Input { get; set; }
    public OutputConfigFile? Output { get; set; }
}

internal sealed class ServerConfigFile
{
    public string? Url { get; set; }
    public string? ApiKey { get; set; }
}

internal sealed class TtsConfigFile
{
    public string? Engine { get; set; }
    public string? Voice { get; set; }
    public string? Format { get; set; }
    public int? SampleRate { get; set; }
}

internal sealed class TranslationConfigFile
{
    public bool? Enabled { get; set; }
    public string? Provider { get; set; }
    public string? ApiKey { get; set; }
    public string? SourceLanguage { get; set; }
    public string? TargetLanguage { get; set; }
    public TransliterationConfigFile? Transliteration { get; set; }
}

internal sealed class TransliterationConfigFile
{
    public bool? Enabled { get; set; }
    public string? FromScript { get; set; }
    public string? ToScript { get; set; }
}

internal sealed class InputConfigFile
{
    public bool? UseClipboard { get; set; }
    public bool? OverwriteClipboardOnCompletion { get; set; }
}

internal sealed class OutputConfigFile
{
    public bool? PlayAudio { get; set; }
    public bool? SaveToFile { get; set; }
    public string? OutputPath { get; set; }
    public string? LogFile { get; set; }
}
