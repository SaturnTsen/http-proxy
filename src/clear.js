import os from 'os';
import { exec } from 'child_process';

const isWindows = os.platform() === 'win32';

const killNodeProcesses = () => {
    const command = isWindows
        ? 'taskkill /F /IM node.exe'
        : 'pkill node'; // Linux 使用 pkill 命令

    console.log(`Executing command: ${command}`
    );
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
};

killNodeProcesses();
