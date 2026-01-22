using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using CallTTS.Configuration;
using CallTTS.Infrastructure;
using Spectre.Console;

namespace CallTTS.Menu;

internal sealed class VoiceSelector
{
    private readonly AppConfig _config;
    private readonly Logger _log;

    public VoiceSelector(AppConfig config, Logger log)
    {
        _config = config;
        _log = log;
    }

    public async Task SelectAsync()
    {
        var voices = await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .SpinnerStyle(Style.Parse("cyan"))
            .StartAsync("Fetching voices...", async _ =>
            {
                return await FetchVoicesAsync();
            });

        if (voices.Count == 0)
        {
            AnsiConsole.MarkupLine("[yellow]No voices available. Using manual input.[/]");
            _config.Tts.Voice = AnsiConsole.Ask("Enter voice ID:", _config.Tts.Voice);
            return;
        }

        // Group voices by language for easier selection
        var languageFilter = AnsiConsole.Prompt(
            new TextPrompt<string>("[cyan]Filter by language (leave empty for all):[/]")
                .AllowEmpty());

        var filteredVoices = string.IsNullOrWhiteSpace(languageFilter)
            ? voices
            : voices.Where(v =>
                v.Id.Contains(languageFilter, StringComparison.OrdinalIgnoreCase) ||
                v.Name.Contains(languageFilter, StringComparison.OrdinalIgnoreCase) ||
                v.Language.Contains(languageFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();

        if (filteredVoices.Count == 0)
        {
            AnsiConsole.MarkupLine($"[yellow]No voices match filter '{languageFilter}'.[/]");
            return;
        }

        var choices = filteredVoices.Select(v =>
        {
            var label = $"{v.Name} ({v.Language})";
            return v.Id == _config.Tts.Voice ? $"{label} [green](current)[/]" : label;
        }).ToList();

        var selected = AnsiConsole.Prompt(
            new SelectionPrompt<string>()
                .Title($"[bold cyan]Select Voice for {_config.Tts.Engine}[/]")
                .PageSize(15)
                .EnableSearch()
                .HighlightStyle(new Style(Color.Cyan1))
                .AddChoices(choices));

        // Find the matching voice
        var selectedIndex = choices.IndexOf(selected);
        if (selectedIndex >= 0 && selectedIndex < filteredVoices.Count)
        {
            _config.Tts.Voice = filteredVoices[selectedIndex].Id;
            AnsiConsole.MarkupLine($"[green]Voice set to: {_config.Tts.Voice}[/]");
        }
    }

    private async Task<List<VoiceInfo>> FetchVoicesAsync()
    {
        try
        {
            var wsUrl = AppendApiKey(_config.Server.Url, _config.Server.ApiKey);
            using var ws = new ClientWebSocket();
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

            await ws.ConnectAsync(new Uri(wsUrl), cts.Token);

            var payload = new Dictionary<string, object?>
            {
                ["type"] = "list_voices",
                ["engine"] = _config.Tts.Engine
            };

            var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload);
            await ws.SendAsync(payloadBytes, WebSocketMessageType.Text, true, cts.Token);

            var buffer = new byte[64 * 1024];
            using var responseStream = new MemoryStream();
            WebSocketReceiveResult result;

            do
            {
                result = await ws.ReceiveAsync(buffer, cts.Token);
                responseStream.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            var responseJson = Encoding.UTF8.GetString(responseStream.ToArray());
            var response = JsonSerializer.Deserialize<VoiceListResponse>(responseJson, Constants.JsonReadOptions);

            return response?.Voices ?? [];
        }
        catch (Exception ex)
        {
            _log.Debug($"Failed to fetch voices: {ex.Message}");
            return [];
        }
    }

    private static string AppendApiKey(string url, string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return url;
        }

        return url.Contains('?')
            ? $"{url}&api_key={apiKey}"
            : $"{url}?api_key={apiKey}";
    }

    private sealed class VoiceListResponse
    {
        public List<VoiceInfo> Voices { get; set; } = [];
    }

    private sealed class VoiceInfo
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Language { get; set; } = string.Empty;
    }
}
