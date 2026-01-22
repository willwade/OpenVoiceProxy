using CallTTS.Configuration;

namespace CallTTS.Services;

internal interface ITtsClient
{
    Task<byte[]> GenerateSpeechAsync(AppConfig config, string text, CancellationToken cancellationToken = default);
}
