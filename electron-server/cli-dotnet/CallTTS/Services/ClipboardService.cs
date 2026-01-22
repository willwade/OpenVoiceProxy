using TextCopy;

namespace CallTTS.Services;

internal sealed class ClipboardService : IClipboardService
{
    public string? GetText()
    {
        try
        {
            return ClipboardService_TextCopy.GetText();
        }
        catch
        {
            return null;
        }
    }

    public void SetText(string text)
    {
        try
        {
            ClipboardService_TextCopy.SetText(text);
        }
        catch
        {
            // Ignore clipboard failures
        }
    }

    private static class ClipboardService_TextCopy
    {
        public static string? GetText() => TextCopy.ClipboardService.GetText();
        public static void SetText(string text) => TextCopy.ClipboardService.SetText(text);
    }
}
