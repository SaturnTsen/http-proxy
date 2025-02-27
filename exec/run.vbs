Set WshShell = CreateObject("WScript.Shell")
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")

' 设置工作目录
WshShell.CurrentDirectory = WshShell.CurrentDirectory & "\.."
' 运行 .bat 文件，隐藏窗口
WshShell.Run WshShell.CurrentDirectory & "\exec\pm2.bat", 0, False

' 等待 5 秒
WScript.Sleep 8000

' 获取所有 conhost.exe 进程
Set colConhost = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'conhost.exe'")

For Each objConhost In colConhost
    ' 1. 获取 conhost 的父进程（即 cmd.exe）
    Set colCmd = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = " & objConhost.ParentProcessId)
    For Each objCmd In colCmd
        If LCase(objCmd.Name) = "cmd.exe" Then
            ' 2. 获取 cmd 的父进程（即 node.exe）
            Set colNode = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = " & objCmd.ParentProcessId)
            For Each objNode In colNode
                If LCase(objNode.Name) = "node.exe" Then
                    ' 3. 验证 node.exe 的路径（可选，防止误杀）
                    If InStr(objNode.ExecutablePath, "C:\nvm4w\nod") > 0 Then
                        objConhost.Terminate()
                        Exit For
                    End If
                End If
            Next
        End If
    Next
Next

Set WshShell = Nothing
Set objWMIService = Nothing