# Proxy Server

This is a proxy server hosted by my virtual machine to route traffic through an VPN, as well as a jump proxy server on the host machine to route shared network traffic.

The primary motivation for creating this setup is that the eduroam network in France causes several issues:
- Eduroam blocks many CDNs used by Tencent and other Chinese network service providers.
- Eduroam restricts UDP ports 4500 and 500, which are required for establishing a VPN connection on the host machine.
- Eduroam employs forced transparent DNS to monitor and potentially intercept user privacy. 

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

1. Clone or copy the proxy server files to your **virtual machine**.

   ```(空)
   git clone https://github.com/SaturnTsen/http-proxy
   cd http-proxy
   ```

2. Install dependencies using `npm`:
   ```bash
   npm install
   ```
### 3. Setup Constants

Before running the proxy server, you need to configure the constants for your environment. You can modify the `constant.example.js` file in the root directory and rename it to `constant.js` to set the necessary parameters.


## Launch Proxy Server on your VM

To start the proxy server, run the following command in your terminal:

```bash
npm run serve
```

## (Optional) Jump Proxy Server on your host machine

If you want to route shared network (e.g. Wi-Fi) traffic through the host machine to your proxy server, you can run the jump proxy server on the host machine.

```bash
npm run serve:jump-proxy
```

## Use PM2 for Process Management

Install PM2 to manage the proxy server:

```bash
npm install -g pm2
```

Start and save the proxy server process:

```(空)
pm2 start "path/to/the/http-proxy/src/proxy.js" --name http-proxy
```

Similarly, start and save the proxy server process:

```bash
pm2 start "path/to/the/http-proxy/src/jump-proxy.js" --name jump-proxy
```

## Contributing

1. Please kindly write a DOCKERFILE for this project, including strongSwan VPN connection and the proxy server.
2. Support for IPv6 is not implemented.
3. Please provide a pull request if you have any improvements or suggestions.

If you find this project helpful, please consider giving it a star :)

## License

This project is provided **as-is** for personal use, under the **MIT License**.

> **Note**: This project was collaboratively developed by **[Saturn Tsen](https://saturntsen.github.io)**, **DeepSeek-R1-671B**, and **GPT-4o**.
