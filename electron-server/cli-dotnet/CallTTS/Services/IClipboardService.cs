namespace CallTTS.Services;

internal interface IClipboardService
{
    string? GetText();
    void SetText(string text);
}
