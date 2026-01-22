using System.CommandLine;

namespace CallTTS.Commands;

internal static class GlobalOptions
{
    public static readonly Option<bool> Interactive = new(
        aliases: ["-i", "--interactive"],
        description: "Launch interactive TUI menu");

    public static readonly Option<string?> Text = new(
        aliases: ["-t", "--text"],
        description: "Text to convert to speech");

    public static readonly Option<string?> ConfigPath = new(
        aliases: ["-c", "--config"],
        description: "Path to configuration file");

    public static readonly Option<string?> OutputPath = new(
        aliases: ["-o", "--output"],
        description: "Output file path for audio");

    public static readonly Option<string?> ServerUrl = new(
        name: "--server",
        description: "WebSocket server URL");

    public static readonly Option<string?> ApiKey = new(
        name: "--api-key",
        description: "API key for authentication");

    public static readonly Option<string?> Engine = new(
        name: "--engine",
        description: "TTS engine to use (azure, elevenlabs, openai, google, polly, watson, playht, witai, espeak, sherpaonnx)");

    public static readonly Option<string?> Voice = new(
        name: "--voice",
        description: "Voice ID to use");

    public static readonly Option<string?> Format = new(
        name: "--format",
        description: "Audio format (wav, mp3, pcm16)");

    public static readonly Option<int?> SampleRate = new(
        name: "--sample-rate",
        description: "Sample rate in Hz");

    public static readonly Option<bool> NoPlay = new(
        name: "--no-play",
        description: "Do not play audio after generation");

    public static readonly Option<string?> LogLevel = new(
        name: "--log-level",
        description: "Logging level (error, warn, info, debug)");

    public static IEnumerable<Option> All => new Option[]
    {
        Interactive,
        Text,
        ConfigPath,
        OutputPath,
        ServerUrl,
        ApiKey,
        Engine,
        Voice,
        Format,
        SampleRate,
        NoPlay,
        LogLevel
    };
}
