using CallTTS.Services;
using Spectre.Console;

namespace CallTTS.Menu;

internal sealed class TextInputPrompt
{
    public string? GetText()
    {
        var inputChoice = AnsiConsole.Prompt(
            new SelectionPrompt<string>()
                .Title("[bold cyan]Input Method[/]")
                .AddChoices([
                    "Type text",
                    "Paste from clipboard",
                    "Multi-line input",
                    "Cancel"
                ]));

        return inputChoice switch
        {
            "Type text" => GetSingleLineText(),
            "Paste from clipboard" => GetClipboardText(),
            "Multi-line input" => GetMultiLineText(),
            _ => null
        };
    }

    private static string? GetSingleLineText()
    {
        var text = AnsiConsole.Prompt(
            new TextPrompt<string>("[cyan]Enter text to speak:[/]")
                .AllowEmpty());

        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static string? GetClipboardText()
    {
        var clipboard = new ClipboardService();
        var text = clipboard.GetText();

        if (string.IsNullOrWhiteSpace(text))
        {
            AnsiConsole.MarkupLine("[yellow]Clipboard is empty.[/]");
            return null;
        }

        // Show preview
        var preview = text.Length > 100 ? text[..100] + "..." : text;
        AnsiConsole.MarkupLine($"[grey]Preview: {Markup.Escape(preview)}[/]");

        var confirm = AnsiConsole.Confirm("Use this text?", true);
        return confirm ? text : null;
    }

    private static string? GetMultiLineText()
    {
        AnsiConsole.MarkupLine("[cyan]Enter text (press Enter twice to finish):[/]");
        AnsiConsole.MarkupLine("[grey]Tip: Type or paste your text, then press Enter twice when done.[/]");

        var lines = new List<string>();
        var emptyLineCount = 0;

        while (emptyLineCount < 2)
        {
            var line = Console.ReadLine();

            if (string.IsNullOrEmpty(line))
            {
                emptyLineCount++;
                if (emptyLineCount == 1 && lines.Count > 0)
                {
                    lines.Add(string.Empty);
                }
            }
            else
            {
                emptyLineCount = 0;
                lines.Add(line);
            }
        }

        // Remove trailing empty lines
        while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[^1]))
        {
            lines.RemoveAt(lines.Count - 1);
        }

        var text = string.Join(Environment.NewLine, lines);
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }
}
