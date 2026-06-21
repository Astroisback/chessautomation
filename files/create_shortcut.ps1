$paths = @(
    [System.Environment]::GetFolderPath('Desktop'),
    "C:\Users\vinay\Desktop"
)

$WshShell = New-Object -ComObject WScript.Shell

foreach ($desktopPath in $paths) {
    if (Test-Path $desktopPath) {
        $shortcutPath = Join-Path $desktopPath "Start Maia-3 Server.lnk"
        $Shortcut = $WshShell.CreateShortcut($shortcutPath)
        $Shortcut.TargetPath = "python.exe"
        $Shortcut.Arguments = '"y:\Chess Automata\files\start_maia3.py"'
        $Shortcut.WorkingDirectory = 'y:\Chess Automata'
        $Shortcut.Description = "Starts the Maia-3 Chess Engine Backend on the VPS"
        $Shortcut.Save()
        Write-Output "Shortcut created successfully at $shortcutPath"
    } else {
        Write-Output "Path not found: $desktopPath"
    }
}
