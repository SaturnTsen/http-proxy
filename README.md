# Proxy Server

This is a proxy server hosted by my virtual machine to route traffic through an
VPN, as well as a jump proxy server on the host machine to route shared network
traffic.

The primary motivation for creating this setup is that the eduroam network in
France causes several issues:
- Eduroam blocks many CDNs used by Tencent and other Chinese network service
providers.
- Eduroam restricts UDP ports 4500 and 500, which are required for establishing
a VPN connection on the host machine.
- Eduroam employs forced transparent DNS to monitor and potentially
intercept user privacy. 

## Structure

```
     IKEv2 VPN  +---------------------------------------+
   <----------- |          Virtual Machine              | 
     Virtual    | (HTTP Proxy Server, Connected to VPN) |
     Outbound   +---------------------------------------+
                                   ↑                                
                      (Traffic to the Proxy server)  
                                   |                                
     Outbound   +---------------------------------------+  
   <----------- |              Host Machine             |  
      traffic   |           (Jump proxy server)         |  
   (Restricted) +---------------------------------------+  
                                   ↑
                     (Traffic to the jump proxy server)
                                   |
                +---------------------------------------+
                |            Mobile Devices             |
                +---------------------------------------+
```

## Setup Instructions

### 1. Requirements

- Node.js installed on the virtual machine.
- VPN configured and active on the virtual machine.
- A local network connection between the host machine and the virtual machine
  (e.g., NAT or Bridged).

### 2. Installation

1. Clone or copy the proxy server files to your virtual machine.
2. Install dependencies using `npm`:
   ```bash
   npm install
   ```
### 3.Setup Constants

Before running the proxy server, you need to configure the constants for your
environment. You can modify the `constant.example.js` file in the root directory
to set the necessary parameters.

### 4. Patch `ecosystem.config.cjs`

You need to modify the `ecosystem.config.cjs` file to set the correct path to
the `npm` script, e.g.:

```
script: "C:\\nvm4w\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
```

### 5. Edit `exec` commands (optional)

Some shortcuts are provided in `exec` folder to start the proxy server.

## Start the Proxy Server

### Starting the Proxy Server

To start the proxy server, run the following command in your terminal:

```bash
npm start
```

#### Auto Disconnect VPN on Exit

If you want the VPN to automatically disconnect when you stop the proxy server
(e.g., by pressing `Ctrl+C`), you can add the `--auto-disconnect` flag:

```bash
npm start -- --auto-disconnect
```

#### Disable Verbose Mode

If you want to disable verbose logging for the proxy server, you can add the `--disable-verbose` flag when starting the server.

```bash
npm start -- --disable-verbose
```

#### Disconnect VPN

If you only want to disconnect the VPN without starting the proxy server, you
can run:

```bash
npm run disconnect
```

#### Notes:
1. `npm start` will launch the proxy server and check if the VPN is connected.
   If the VPN is not connected, the system will automatically attempt to connect
   to it.
2. If the `--auto-disconnect` flag is provided, the system will disconnect the
   VPN automatically when you stop the proxy server (e.g., when sending the
   `SIGINT` signal or pressing `Ctrl+C`).

## Host Machine Configuration

Set up the host machine to use the virtual machine's proxy:

1. Configure the proxy settings in your application or operating system:
   - **Proxy IP**: `192.168.22.135` (replace with your virtual machine's IP
     address)
   - **Proxy Port**: `1080`

2. Test the proxy by `curl -x http://192.168.22.135:1080 https://ipv4.ddnspod.com`


### Optional: Jump Proxy Server

If you want to route shared network traffic through the host machine, you can
run the jump proxy server on the host machine.

```bash
npm run serve:jump-proxy
```

## Optional: Use PM2 for Process Management

This is not recommended for Windows users, as pm2 does not fully support Windows
platforms.

Install PM2 to manage the proxy server:

```bash
npm install -g pm2
```

Start and save the proxy server process:

```bash
pm2 start proxy.js --name "proxy-server"
pm2 save
```

To enable auto-start on Windows:

```bash
pm2 startup
```

Follow the instructions provided by PM2.

## Contributing

1. Please kindly write a DOCKERFILE for this project, including strongSwan VPN
   connection and the proxy server.
2. Support for IPv6 is not tested yet.
3. Please provide a pull request if you have any improvements or suggestions.

If you find this project helpful, please consider giving it a star :)

## License

This project is provided **as-is** for personal use, under the **MIT License**.

> **Note**: This project was collaboratively developed by **[Saturn
> Tsen](https://saturntsen.github.io)**, **DeepSeek-R1-671B**, and **GPT-4o**.
