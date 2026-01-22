using System.Runtime.InteropServices;
using System.Text.Json;

namespace CallTTS.Configuration;

internal static class ConfigLoader
{
    public static AppConfig Load(string? path)
    {
        var resolvedPath = string.IsNullOrWhiteSpace(path)
            ? GetDefaultConfigPath()
            : Path.GetFullPath(path);

        var config = AppConfig.CreateDefault();
        var isDefaultPath = string.Equals(resolvedPath, GetDefaultConfigPath(), StringComparison.OrdinalIgnoreCase);

        if (isDefaultPath)
        {
            var dir = Path.GetDirectoryName(resolvedPath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            if (!File.Exists(resolvedPath))
            {
                File.WriteAllText(resolvedPath, JsonSerializer.Serialize(config, Constants.JsonWriteOptions));
                return config;
            }
        }

        if (!File.Exists(resolvedPath))
        {
            return config;
        }

        try
        {
            var json = File.ReadAllText(resolvedPath);
            var fileConfig = JsonSerializer.Deserialize<ConfigFile>(json, Constants.JsonReadOptions);
            if (fileConfig != null)
            {
                config.Apply(fileConfig);
            }
        }
        catch
        {
            // Ignore invalid config and use defaults
        }

        return config;
    }

    public static void Save(AppConfig config, string? path = null)
    {
        var resolvedPath = string.IsNullOrWhiteSpace(path)
            ? GetDefaultConfigPath()
            : Path.GetFullPath(path);

        var dir = Path.GetDirectoryName(resolvedPath);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        File.WriteAllText(resolvedPath, JsonSerializer.Serialize(config, Constants.JsonWriteOptions));
    }

    public static string GetDefaultConfigPath()
    {
        var baseDir = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
            : RuntimeInformation.IsOSPlatform(OSPlatform.OSX)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "Library", "Application Support")
                : Environment.GetEnvironmentVariable("XDG_CONFIG_HOME") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), ".config");

        return Path.Combine(baseDir, Constants.AppName, Constants.CliName, "config.json");
    }
}
