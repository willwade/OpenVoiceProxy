namespace CallTTS.Services;

internal interface IAudioPlayer
{
    void Play(byte[] audio, string format, int sampleRate);
}
