#!/usr/bin/env node

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { program } = require("commander");

// Default configuration
const defaultConfig = {
  server: {
    url: "ws://localhost:3000/api/ws",
    apiKey: "dev",
  },
  tts: {
    engine: "azure",
    voice: "en-US-JennyNeural",
    format: "wav",
    sampleRate: 24000,
  },
  translation: {
    enabled: false,
    provider: "google",
    apiKey: "",
    sourceLanguage: "auto",
    targetLanguage: "en",
    transliteration: {
      enabled: false,
      fromScript: "Latn",
      toScript: "Arab"
    }
  },
  input: {
    useClipboard: true,
    overwriteClipboardOnCompletion: false
  },
  output: {
    playAudio: true,
    saveToFile: false,
    logFile: "calltts.log",
  },
};

// Parse command line arguments
program
  .name("CallTTS")
  .description("CLI tool for TTS generation via OpenVoiceProxy")
  .version("1.0.0");

program
  .option("-t, --text <text>", "Text to convert to speech (uses clipboard if not provided)")
  .option("-c, --config <path>", "Path to configuration file", "config.json")
  .option("-o, --output <path>", "Output file path for audio")
  .option("--server <url>", "WebSocket server URL", defaultConfig.server.url)
  .option(
    "--api-key <key>",
    "API key for authentication",
    defaultConfig.server.apiKey,
  )
  .option("--engine <name>", "TTS engine to use", defaultConfig.tts.engine)
  .option("--voice <id>", "Voice ID to use", defaultConfig.tts.voice)
  .option(
    "--format <type>",
    "Audio format (wav, mp3, pcm16)",
    defaultConfig.tts.format,
  )
  .option(
    "--sample-rate <rate>",
    "Sample rate in Hz",
    defaultConfig.tts.sampleRate.toString(),
  )
  .option("--no-play", "Do not play audio after generation")
  .option(
    "--log-level <level>",
    "Logging level (error, warn, info, debug)",
    "info",
  )
  .action((options) => {
    main(options);
  });

program.parse();

// Clipboard helper functions
function getClipboard() {
  try {
    if (process.platform === 'darwin') {
      // macOS
      return execSync('pbpaste', { encoding: 'utf8' });
    } else if (process.platform === 'win32') {
      // Windows - using PowerShell
      return execSync('powershell.exe -command "Get-Clipboard"', { encoding: 'utf8' }).trim();
    } else {
      // Linux - try xclip or xsel
      try {
        return execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
      } catch {
        return execSync('xsel --clipboard --output', { encoding: 'utf8' });
      }
    }
  } catch (error) {
    throw new Error(`Failed to read clipboard: ${error.message}`);
  }
}

function setClipboard(text) {
  try {
    if (process.platform === 'darwin') {
      // macOS
      execSync('pbcopy', { input: text });
    } else if (process.platform === 'win32') {
      // Windows - using PowerShell
      execSync(`powershell.exe -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
    } else {
      // Linux - try xclip or xsel
      try {
        execSync('xclip -selection clipboard', { input: text });
      } catch {
        execSync('xsel --clipboard --input', { input: text });
      }
    }
  } catch (error) {
    throw new Error(`Failed to write to clipboard: ${error.message}`);
  }
}

// Main function
async function main(options) {
  // Load configuration
  const config = loadConfig(options.config);

  // Override config with command line arguments
  if (options.server) config.server.url = options.server;
  if (options.apiKey) config.server.apiKey = options.apiKey;
  if (options.engine) config.tts.engine = options.engine;
  if (options.voice) config.tts.voice = options.voice;
  if (options.format) config.tts.format = options.format;
  if (options.sampleRate) config.tts.sampleRate = parseInt(options.sampleRate);
  if (options.output) {
    config.output.saveToFile = true;
    config.output.outputPath = options.output;
  }
  if (options.play !== undefined) config.output.playAudio = options.play;

  // Setup logging
  const log = setupLogger(config.output.logFile, options.logLevel);

  try {
    // Get text from command line or clipboard
    let text = options.text;
    if (!text && config.input?.useClipboard) {
      log.info("No --text provided, reading from clipboard...");
      text = getClipboard();
      log.info(`Read ${text.length} characters from clipboard`);
    }

    if (!text) {
      throw new Error("No text provided. Use --text or enable clipboard in config.");
    }

    // Generate speech
    const audioBuffer = await generateSpeech(config, text, log);

    // Save to file if requested
    if (config.output.saveToFile && config.output.outputPath) {
      fs.writeFileSync(config.output.outputPath, audioBuffer);
      log.info(`Audio saved to ${config.output.outputPath}`);
    }

    // Play audio if requested
    if (config.output.playAudio) {
      playAudio(audioBuffer, log, config.tts.format);
    }

    log.info("TTS generation completed successfully");
  } catch (error) {
    log.error(`TTS generation failed: ${error.message}`);
    process.exit(1);
  }
}

// Load configuration from file
function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return mergeDeep(defaultConfig, fileConfig);
    } else {
      console.warn(`Config file ${configPath} not found, using defaults`);
      return defaultConfig;
    }
  } catch (error) {
    console.error(`Error loading config file: ${error.message}`);
    return defaultConfig;
  }
}

// Deep merge objects
function mergeDeep(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}

// Setup logger
function setupLogger(logFile, level) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = levels[level] || 2;

  return {
    error: (msg) =>
      levels.error <= currentLevel && logMessage("ERROR", msg, logFile),
    warn: (msg) =>
      levels.warn <= currentLevel && logMessage("WARN", msg, logFile),
    info: (msg) =>
      levels.info <= currentLevel && logMessage("INFO", msg, logFile),
    debug: (msg) =>
      levels.debug <= currentLevel && logMessage("DEBUG", msg, logFile),
  };
}

function logMessage(level, message, logFile) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${level}: ${message}\n`;

  console.log(`${level}: ${message}`);

  if (logFile) {
    try {
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }
}

// Generate speech using WebSocket
function generateSpeech(config, text, log) {
  return new Promise((resolve, reject) => {
    log.info(`Connecting to ${config.server.url}`);

    // Build WebSocket URL with API key
    let wsUrl = config.server.url;
    if (wsUrl.includes("?")) {
      wsUrl += `&api_key=${config.server.apiKey}`;
    } else {
      wsUrl += `?api_key=${config.server.apiKey}`;
    }

    const ws = new WebSocket(wsUrl);
    let audioBuffer = Buffer.alloc(0);
    let hasStarted = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timed out after 30 seconds"));
    }, 30000);

    ws.on("open", () => {
      log.info("WebSocket connection established");

      // Send TTS request
      const request = {
        type: "speak",
        text: text,
        engine: config.tts.engine,
        voice: config.tts.voice,
        format: config.tts.format,
        sampleRate: config.tts.sampleRate,
      };

      log.debug(`Request: ${JSON.stringify(request)}`);
      ws.send(JSON.stringify(request));
    });

    ws.on("message", (data) => {
      try {
        // Try to parse as JSON
        const message = JSON.parse(data.toString());

        log.debug(`Received message: ${message.type}`);

        if (message.type === "meta") {
          hasStarted = true;
          log.info("Started receiving audio data");
          log.debug(`Metadata: ${JSON.stringify(message)}`);
        } else if (message.type === "error") {
          clearTimeout(timeout);
          reject(new Error(`Server error: ${message.error}`));
        } else if (message.type === "end") {
          clearTimeout(timeout);
          log.info(
            `Finished receiving audio data (${audioBuffer.length} bytes)`,
          );
          resolve(audioBuffer);
        }
      } catch (e) {
        // Binary data
        if (hasStarted) {
          audioBuffer = Buffer.concat([audioBuffer, data]);
        }
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });

    ws.on("close", (code, reason) => {
      if (!hasStarted) {
        clearTimeout(timeout);
        reject(
          new Error(
            `WebSocket closed before receiving data: ${code} ${reason}`,
          ),
        );
      }
    });
  });
}

// Play audio using system command
function playAudio(audioBuffer, log, format) {
  const tempFile = path.join(
    require("os").tmpdir(),
    `calltts-${Date.now()}.${formatToFileExtension(format)}`,
  );

  try {
    fs.writeFileSync(tempFile, audioBuffer);
    log.debug(`Temporary audio file created: ${tempFile}`);

    let command;

    if (process.platform === "win32") {
      command = `powershell -Command "(New-Object Media.SoundPlayer '${tempFile}').PlaySync();"`;
    } else if (process.platform === "darwin") {
      command = `afplay "${tempFile}"`;
    } else {
      command = `aplay "${tempFile}"`;
    }

    log.debug(`Playing audio with: ${command}`);

    const child = spawn(command, { shell: true });

    child.on("exit", (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
        log.debug("Temporary audio file removed");
      } catch (error) {
        log.warn(`Failed to remove temp file: ${error.message}`);
      }

      if (code !== 0) {
        log.warn(`Audio player exited with code ${code}`);
      }
    });

    child.on("error", (error) => {
      log.error(`Failed to play audio: ${error.message}`);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore
      }
    });
  } catch (error) {
    log.error(`Failed to create temporary audio file: ${error.message}`);
  }
}

function formatToFileExtension(format) {
  switch (format.toLowerCase()) {
    case "wav":
      return "wav";
    case "mp3":
      return "mp3";
    case "pcm16":
      return "pcm";
    default:
      return "wav";
  }
}
