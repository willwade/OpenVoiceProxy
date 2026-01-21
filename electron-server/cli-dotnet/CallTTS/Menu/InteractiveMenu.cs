using CallTTS.Configuration;
using CallTTS.Infrastructure;
using CallTTS.Services;
using Spectre.Console;

namespace CallTTS.Menu;

internal sealed class InteractiveMenu
{
    private readonly AppConfig _config;
    private readonly Logger _log;

    public InteractiveMenu(AppConfig config, Logger log)
    {
        _config = config;
        _log = log;
    }

    public async Task<int> RunAsync()
    {
        AnsiConsole.Clear();
        DisplayHeader();

        while (true)
        {
            var choice = AnsiConsole.Prompt(
                new SelectionPrompt<string>()
                    .Title("[bold cyan]What would you like to do?[/]")
                    .PageSize(10)
                    .HighlightStyle(new Style(Color.Cyan1))
                    .AddChoices([
                        "Speak Text",
                        "Select Engine",
                        "Select Voice",
                        "Settings",
                        "Exit"
                    ]));

            switch (choice)
            {
                case "Speak Text":
                    await SpeakTextAsync();
                    break;
                case "Select Engine":
                    SelectEngine();
                    break;
                case "Select Voice":
                    await SelectVoiceAsync();
                    break;
                case "Settings":
                    ConfigureSettings();
                    break;
                case "Exit":
                    AnsiConsole.MarkupLine("[grey]Goodbye![/]");
                    return 0;
            }

            AnsiConsole.WriteLine();
        }
    }

    private void DisplayHeader()
    {
        var panel = new Panel(
            new FigletText("CallTTS")
                .LeftJustified()
                .Color(Color.Cyan1))
        {
            Border = BoxBorder.Rounded,
            Padding = new Padding(1, 0),
            Header = new PanelHeader("[bold]OpenVoiceProxy CLI[/]", Justify.Center)
        };

        AnsiConsole.Write(panel);
        AnsiConsole.WriteLine();

        DisplayCurrentConfig();
    }

    private void DisplayCurrentConfig()
    {
        var table = new Table()
            .Border(TableBorder.Rounded)
            .AddColumn("[bold]Setting[/]")
            .AddColumn("[bold]Value[/]");

        table.AddRow("Engine", $"[cyan]{_config.Tts.Engine}[/]");
        table.AddRow("Voice", $"[cyan]{_config.Tts.Voice}[/]");
        table.AddRow("Format", $"[grey]{_config.Tts.Format}[/]");
        table.AddRow("Sample Rate", $"[grey]{_config.Tts.SampleRate} Hz[/]");
        table.AddRow("Server", $"[grey]{_config.Server.Url}[/]");

        AnsiConsole.Write(table);
        AnsiConsole.WriteLine();
    }

    private async Task SpeakTextAsync()
    {
        var textPrompt = new TextInputPrompt();
        var text = textPrompt.GetText();

        if (string.IsNullOrWhiteSpace(text))
        {
            AnsiConsole.MarkupLine("[yellow]No text provided.[/]");
            return;
        }

        var retryCount = 0;
        const int maxRetries = 3;

        while (retryCount < maxRetries)
        {
            var success = await TryGenerateSpeechAsync(text);
            if (success)
            {
                break;
            }

            retryCount++;
            if (retryCount >= maxRetries)
            {
                AnsiConsole.MarkupLine("[red]Maximum retry attempts reached.[/]");
            }
        }
    }

    private async Task<bool> TryGenerateSpeechAsync(string text)
    {
        try
        {
            await AnsiConsole.Status()
                .Spinner(Spinner.Known.Dots)
                .SpinnerStyle(Style.Parse("cyan"))
                .StartAsync("Generating speech...", async ctx =>
                {
                    var ttsClient = new WebSocketTtsClient(_log);
                    var audio = await ttsClient.GenerateSpeechAsync(_config, text);

                    ctx.Status("Playing audio...");

                    if (_config.Output.PlayAudio)
                    {
                        var player = new NAudioPlayer(_log);
                        player.Play(audio, _config.Tts.Format, _config.Tts.SampleRate);
                    }

                    if (_config.Output.SaveToFile && !string.IsNullOrWhiteSpace(_config.Output.OutputPath))
                    {
                        var outputPath = Path.GetFullPath(_config.Output.OutputPath);
                        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
                        File.WriteAllBytes(outputPath, audio);
                        AnsiConsole.MarkupLine($"[green]Audio saved to {outputPath}[/]");
                    }

                    AnsiConsole.MarkupLine("[green]Done![/]");
                });

            return true;
        }
        catch (Exception ex) when (IsApiKeyError(ex))
        {
            AnsiConsole.MarkupLine($"[red]Authentication failed: {ex.Message}[/]");
            return await PromptForApiKeyAsync();
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error: {ex.Message}[/]");
            return true; // Don't retry non-auth errors
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

    private async Task<bool> PromptForApiKeyAsync()
    {
        var retry = AnsiConsole.Confirm("[yellow]Would you like to enter a different API key?[/]", true);
        if (!retry)
        {
            return true; // User chose not to retry
        }

        _config.Server.ApiKey = AnsiConsole.Prompt(
            new TextPrompt<string>("[cyan]Enter API key:[/]")
                .Secret());

        var saveConfig = AnsiConsole.Confirm("[grey]Save this API key to config?[/]", false);
        if (saveConfig)
        {
            try
            {
                ConfigLoader.Save(_config);
                AnsiConsole.MarkupLine("[green]Config saved.[/]");
            }
            catch
            {
                AnsiConsole.MarkupLine("[yellow]Could not save config.[/]");
            }
        }

        return false; // Signal to retry with new key
    }

    private void SelectEngine()
    {
        var engineSelector = new EngineSelector(_config);
        engineSelector.Select();
        DisplayCurrentConfig();
    }

    private async Task SelectVoiceAsync()
    {
        var voiceSelector = new VoiceSelector(_config, _log);
        await voiceSelector.SelectAsync();
        DisplayCurrentConfig();
    }

    private void ConfigureSettings()
    {
        var settingsChoice = AnsiConsole.Prompt(
            new SelectionPrompt<string>()
                .Title("[bold cyan]Settings[/]")
                .PageSize(10)
                .AddChoices([
                    "Server URL",
                    "API Key",
                    "Audio Format",
                    "Sample Rate",
                    "Toggle Audio Playback",
                    "Save Config",
                    "Back"
                ]));

        switch (settingsChoice)
        {
            case "Server URL":
                _config.Server.Url = AnsiConsole.Ask("Enter server URL:", _config.Server.Url);
                break;
            case "API Key":
                _config.Server.ApiKey = AnsiConsole.Prompt(
                    new TextPrompt<string>("Enter API key:")
                        .DefaultValue(_config.Server.ApiKey)
                        .Secret());
                break;
            case "Audio Format":
                _config.Tts.Format = AnsiConsole.Prompt(
                    new SelectionPrompt<string>()
                        .Title("Select audio format:")
                        .AddChoices(["wav", "mp3", "pcm16"]));
                break;
            case "Sample Rate":
                _config.Tts.SampleRate = AnsiConsole.Prompt(
                    new SelectionPrompt<int>()
                        .Title("Select sample rate:")
                        .AddChoices([8000, 16000, 22050, 24000, 44100, 48000]));
                break;
            case "Toggle Audio Playback":
                _config.Output.PlayAudio = !_config.Output.PlayAudio;
                AnsiConsole.MarkupLine($"[cyan]Audio playback: {(_config.Output.PlayAudio ? "ON" : "OFF")}[/]");
                break;
            case "Save Config":
                try
                {
                    ConfigLoader.Save(_config);
                    AnsiConsole.MarkupLine($"[green]Config saved to {ConfigLoader.GetDefaultConfigPath()}[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]Failed to save config: {ex.Message}[/]");
                }
                break;
        }

        if (settingsChoice != "Back")
        {
            DisplayCurrentConfig();
        }
    }
}
