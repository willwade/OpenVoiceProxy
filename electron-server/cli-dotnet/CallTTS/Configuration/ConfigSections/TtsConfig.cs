namespace CallTTS.Configuration.ConfigSections;

internal sealed class TtsConfig
{
    public string Engine { get; set; } = string.Empty;
    public string Voice { get; set; } = string.Empty;
    public string Format { get; set; } = string.Empty;
    public int SampleRate { get; set; }
}
