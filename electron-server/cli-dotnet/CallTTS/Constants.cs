using System.Text.Json;

namespace CallTTS;

internal static class Constants
{
    public const string AppName = "OpenVoiceProxy";
    public const string CliName = "CallTTS";
    public const string Version = "1.0.0";
    public const int DefaultTimeoutSeconds = 30;

    public static readonly JsonSerializerOptions JsonWriteOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public static readonly JsonSerializerOptions JsonReadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}
