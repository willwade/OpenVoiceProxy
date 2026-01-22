namespace CallTTS.Configuration.ConfigSections;

internal sealed class OutputConfig
{
    public bool PlayAudio { get; set; }
    public bool SaveToFile { get; set; }
    public string? OutputPath { get; set; }
    public string? LogFile { get; set; }
}
