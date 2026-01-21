using CallTTS.Configuration;
using Spectre.Console;

namespace CallTTS.Menu;

internal sealed class EngineSelector
{
    private readonly AppConfig _config;

    private static readonly string[] AvailableEngines =
    [
        "azure",
        "elevenlabs",
        "openai",
        "google",
        "polly",
        "watson",
        "playht",
        "witai",
        "espeak",
        "sherpaonnx"
    ];

    public EngineSelector(AppConfig config)
    {
        _config = config;
    }

    public void Select()
    {
        var choices = AvailableEngines.Select(e =>
            e == _config.Tts.Engine ? $"{e} [green](current)[/]" : e).ToList();

        var selected = AnsiConsole.Prompt(
            new SelectionPrompt<string>()
                .Title("[bold cyan]Select TTS Engine[/]")
                .PageSize(10)
                .HighlightStyle(new Style(Color.Cyan1))
                .AddChoices(choices));

        // Remove the "(current)" marker if present
        var engine = selected.Replace(" [green](current)[/]", "");
        _config.Tts.Engine = engine;

        AnsiConsole.MarkupLine($"[green]Engine set to: {engine}[/]");
    }
}
