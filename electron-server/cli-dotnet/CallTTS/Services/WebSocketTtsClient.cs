using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using CallTTS.Configuration;
using CallTTS.Infrastructure;

namespace CallTTS.Services;

internal sealed class WebSocketTtsClient : ITtsClient
{
    private readonly Logger _log;

    public WebSocketTtsClient(Logger log)
    {
        _log = log;
    }

    public async Task<byte[]> GenerateSpeechAsync(AppConfig config, string text, CancellationToken cancellationToken = default)
    {
        var wsUrl = AppendApiKey(config.Server.Url, config.Server.ApiKey);
        using var ws = new ClientWebSocket();

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(Constants.DefaultTimeoutSeconds));

        _log.Info($"Connecting to {wsUrl}");
        await ws.ConnectAsync(new Uri(wsUrl), cts.Token);

        var payload = new Dictionary<string, object?>
        {
            ["type"] = "speak",
            ["text"] = text,
            ["engine"] = config.Tts.Engine,
            ["voice"] = config.Tts.Voice,
            ["format"] = config.Tts.Format,
            ["sample_rate"] = config.Tts.SampleRate,
        };

        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload);
        await ws.SendAsync(payloadBytes, WebSocketMessageType.Text, true, cts.Token);

        var audioStream = new MemoryStream();
        var started = false;

        while (ws.State == WebSocketState.Open)
        {
            var message = await ReceiveMessageAsync(ws, cts.Token);
            if (message.MessageType == WebSocketMessageType.Close)
            {
                break;
            }

            if (message.MessageType == WebSocketMessageType.Text)
            {
                var type = GetMessageType(message.TextPayload, out var errorMessage);
                if (!string.IsNullOrWhiteSpace(errorMessage))
                {
                    throw new InvalidOperationException(errorMessage);
                }

                if (type == "meta")
                {
                    started = true;
                    _log.Info("Started receiving audio data");
                }
                else if (type == "end")
                {
                    break;
                }
            }
            else if (message.MessageType == WebSocketMessageType.Binary)
            {
                started = true;
                audioStream.Write(message.BinaryPayload, 0, message.BinaryPayload.Length);
            }
        }

        if (!started)
        {
            throw new InvalidOperationException("WebSocket closed before receiving audio");
        }

        return audioStream.ToArray();
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

    private static string? GetMessageType(string json, out string? errorMessage)
    {
        errorMessage = null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var errorProp))
            {
                errorMessage = $"Server error: {errorProp.GetString()}";
                return null;
            }

            if (doc.RootElement.TryGetProperty("message", out var messageProp) &&
                doc.RootElement.TryGetProperty("code", out var codeProp) &&
                codeProp.GetString() == "ERROR")
            {
                errorMessage = messageProp.GetString();
                return null;
            }

            if (doc.RootElement.TryGetProperty("type", out var typeProp))
            {
                return typeProp.GetString();
            }
        }
        catch
        {
            // Ignore malformed JSON
        }

        return null;
    }

    private static async Task<WsMessage> ReceiveMessageAsync(ClientWebSocket ws, CancellationToken token)
    {
        var buffer = new byte[64 * 1024];
        using var payload = new MemoryStream();
        WebSocketReceiveResult? result;

        do
        {
            result = await ws.ReceiveAsync(buffer, token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return WsMessage.Close();
            }

            payload.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);

        if (result.MessageType == WebSocketMessageType.Text)
        {
            return WsMessage.Text(Encoding.UTF8.GetString(payload.ToArray()));
        }

        return WsMessage.Binary(payload.ToArray());
    }
}
