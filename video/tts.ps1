param([string]$TextFile, [string]$OutFile, [string]$Voice = "Microsoft Zira Desktop", [int]$Rate = 0)
# Offline Windows text-to-speech used as placeholder narration. Replace with your own recordings in video/voice/.
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($Voice)
$s.Rate = $Rate
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($OutFile, $fmt)
$s.Speak([System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8))
$s.Dispose()
