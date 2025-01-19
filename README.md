# Proxy Server

This is a proxy server hosted by my virtual machine to route traffic through an
VPN.

The primary motivation for creating this setup is that the eduroam network in
France causes several issues:
- Eduoram blocks many CDNs used by Tencent and other Chinese network service
providers.
- Eduroam restricts UDP ports 4500 and 500, which are required for establishing
a VPN connection on the host machine.
- Eduroam employs forced transparent DNS to monitor and potentially
intercept user privacy. 

Personal reasons:
- The host machine uses EpocCam, a virtual webcam app, which cannot be normally
accessed by the virtual machine, necessitating the use of Tencent Meeting
directly on the host machine.
- Access to Laboratory Resources: Direct connections to laboratory computing
  clusters are also restricted on the eduroam network, preventing remote access.

## Structure

To bypass the UDP restrictions, I have used a NAT wrapper to connect the virtual
machine and the host machine, to circumvent the block on UDP ports 4500 and 500.

```
        +---------------------------------------+
        |          Virtual Machine              |  <--- VPN + Proxy Forwarding
        | (HTTP Proxy Server Connected to VPN)  |
        +---------------------------------------+
            ↑                                |
 NAT Layer  | (Traffic to the Proxy server)  | (Traffic via Proxy & VPN)
            |                                v
        +---------------------------------------+
        |            Host Machine               |  
        |        (NAT for eduroam Access)       |
        +---------------------------------------+
                    |
                    | (External Internet via eduroam)
                    v
        +---------------------------------------+
        |               Eduroam                 |  <- Restricts UDP ports 4500/500
        +---------------------------------------+
```

This "boomerang structure" enables the host machine to forward traffic to the
virtual machine, which then sends the traffic through the VPN, bypassing
eduroam's restrictions and allowing access to blocked services.

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



## Usage


#### Start the Proxy Server

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

## Optional: Use PM2 for Process Management

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


## License

This project is provided **as-is** for personal use, under the **MIT License**.

> **Note**: This project was collaboratively developed by **[Saturn Tsen](https://saturntsen.github.io)** and **ChatGPT**.
