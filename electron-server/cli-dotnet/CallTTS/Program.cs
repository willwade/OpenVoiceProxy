using System.CommandLine;
using CallTTS.Commands;

return await SpeakCommand.Create().InvokeAsync(args);
