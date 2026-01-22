using CallTTS.Infrastructure;
using NAudio.Wave;

namespace CallTTS.Services;

internal sealed class NAudioPlayer : IAudioPlayer
{
    private readonly Logger _log;

    public NAudioPlayer(Logger log)
    {
        _log = log;
    }

    public void Play(byte[] audio, string format, int sampleRate)
    {
        try
        {
            using var reader = CreateAudioReader(audio, format, sampleRate);
            using var outputDevice = new WaveOutEvent();
            using var playbackCompleted = new ManualResetEventSlim(false);

            outputDevice.PlaybackStopped += (_, _) => playbackCompleted.Set();
            outputDevice.Init(reader);
            outputDevice.Play();
            playbackCompleted.Wait();
        }
        catch (Exception ex)
        {
            _log.Warn($"Failed to play audio: {ex.Message}");
        }
    }

    private static WaveStream CreateAudioReader(byte[] audio, string format, int sampleRate)
    {
        var normalized = format.ToLowerInvariant();
        var stream = new MemoryStream(audio, writable: false);

        return normalized switch
        {
            "wav" => new WaveFileReader(stream),
            "mp3" => new Mp3FileReader(stream),
            "pcm16" => new RawSourceWaveStream(stream, new WaveFormat(sampleRate, 16, 1)),
            _ => new WaveFileReader(stream),
        };
    }
}
