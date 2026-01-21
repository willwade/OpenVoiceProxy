namespace CallTTS.Infrastructure;

internal sealed class Logger
{
    private readonly string? _logFile;
    private readonly int _level;

    public Logger(string? logFile, string level)
    {
        _logFile = logFile;
        _level = level switch
        {
            "error" => 0,
            "warn" => 1,
            "info" => 2,
            "debug" => 3,
            _ => 2
        };
    }

    public void Error(string message) => Log("ERROR", 0, message);
    public void Warn(string message) => Log("WARN", 1, message);
    public void Info(string message) => Log("INFO", 2, message);
    public void Debug(string message) => Log("DEBUG", 3, message);

    private void Log(string level, int levelValue, string message)
    {
        if (levelValue > _level)
        {
            return;
        }

        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        var line = $"[{timestamp}] {level}: {message}";
        Console.WriteLine($"{level}: {message}");

        if (string.IsNullOrWhiteSpace(_logFile))
        {
            return;
        }

        try
        {
            var dir = Path.GetDirectoryName(_logFile);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.AppendAllText(_logFile, line + Environment.NewLine);
        }
        catch
        {
            // Ignore logging failures
        }
    }
}
