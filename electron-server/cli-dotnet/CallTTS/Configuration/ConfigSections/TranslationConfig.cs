namespace CallTTS.Configuration.ConfigSections;

internal sealed class TranslationConfig
{
    public bool Enabled { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string SourceLanguage { get; set; } = string.Empty;
    public string TargetLanguage { get; set; } = string.Empty;
    public TransliterationConfig Transliteration { get; set; } = new();
}

internal sealed class TransliterationConfig
{
    public bool Enabled { get; set; }
    public string FromScript { get; set; } = string.Empty;
    public string ToScript { get; set; } = string.Empty;
}
