using System.Net.WebSockets;

namespace CallTTS.Infrastructure;

internal sealed record WsMessage(WebSocketMessageType MessageType, string TextPayload, byte[] BinaryPayload)
{
    public static WsMessage Text(string text) => new(WebSocketMessageType.Text, text, Array.Empty<byte>());
    public static WsMessage Binary(byte[] data) => new(WebSocketMessageType.Binary, string.Empty, data);
    public static WsMessage Close() => new(WebSocketMessageType.Close, string.Empty, Array.Empty<byte>());
}
