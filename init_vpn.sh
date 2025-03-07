#!/bin/bash
# init_vpn.sh

## USAGE
usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  vpn_username=XXX your VPN username"
    echo "  password=XXX     your VPN password"
    cleanup
    exit 1
}

# Function to clear password variables
# Trap SIGINT (Ctrl+C) to call cleanup function
cleanup() {
    unset PASSWORD
    unset VPN_NAME
    echo "Interruption"
    exit 1
}
trap cleanup SIGINT

# Initialize variables
user_name=$(whoami)
vpn_name=""
vpn_password=""

for arg in "$@"; do
    # Check if the argument starts with 'password='
    if [[ $arg == password=* ]]; then
        # Extract the password value
        vpn_password="${arg#password=}"
    elif [[ $arg == vpn_username=* ]]; then
        vpn_name="${arg#vpn_username=}"
    fi
done

if [[ -z $vpn_password || -z $vpn_name ]]; then
    echo "Error: No vpn_username and password argument found."
    usage  # Display usage information and exit
fi

## UPDATES AND INSTALLATIONS
echo 'INSTALLING PACKAGES…'
sudo apt update
sudo apt upgrade -y

sudo apt install -y ttf-wqy-microhei ttf-wqy-zenhei xfonts-wqy
sudo apt install -y strongswan strongswan-swanctl
sudo apt install -y libstrongswan-extra-plugins libcharon-extra-plugins
sudo apt install -y libcharon-extauth-plugins libstrongswan-standard-plugins
sudo rm -f /etc/ipsec.d/cacerts/*
sudo ln -s /etc/ssl/certs/* /etc/ipsec.d/cacerts/

## Apparmor: ALLOW Strongswan (for Ubuntu desktop distro)
# sudo apt install -y apparmor-utils 
# sudo nano /etc/apparmor.d/usr.lib.ipsec.charon
# 允许写入 systemd-resolved 的 DNS 配置
# /run/systemd/resolve/stub-resolv.conf rw
# sudo apparmor_parser -r /etc/apparmor.d/usr.lib.ipsec.charon


## CONFIGURE VPN
echo 'CONFIGURING VPN'
sudo bash -c "cat <<EOF > '/etc/swanctl/conf.d/sjtuvpn.conf'
connections {
 vpn-student { 
  vips = 0.0.0.0,:: 
  remote_addrs = stu.vpn.sjtu.edu.cn 
  send_certreq = no 
  local { 
   auth = eap-peap 
   eap_id = username
   aaa_id = @radius.net.sjtu.edu.cn 
  } 
  remote { 
   auth = pubkey 
   id = @stu.vpn.sjtu.edu.cn 
  } 
  children { 
   vpn-student { 
   remote_ts = 0.0.0.0/0,::/0 
   } 
  } 
  version = 2 
  mobike = no 
 } 
}

secrets {
 eap-jaccount {
  id = username
  secret = \"PASSWORD\"
 }
}
EOF"
sudo sed -i -e "s/eap_id = username/eap_id = $vpn_name/" \
             -e "s/id = username/id = $vpn_name/" \
             -e "s/secret = \"PASSWORD\"/secret = \"$vpn_password\"/" \
             "/etc/swanctl/conf.d/sjtuvpn.conf"
sudo chmod 0600 /etc/swanctl/conf.d/sjtuvpn.conf
sudo sed -i 's/load = yes/load = no/' /etc/strongswan.d/charon/revocation.conf

## FIREFOX
# echo 'INSTALLING FIREFOX'
# sudo snap install firefox
# echo "firefox > /dev/null 2>&1 &" > "/home/${user_name}/firefox.sh"
# sudo chmod 755 "/home/${user_name}/firefox.sh"
# sudo ln -s "/home/${user_name}/firefox.sh" "/usr/bin/browser"

## Node.js
sudo apt install curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

## CREATE SHORTCUTS 
echo 'CREATING SHORTCUTS'
sudo cat <<EOF > "/home/${user_name}/vpnon.sh"
# sudo aa-complain /usr/lib/ipsec/charon
# sudo aa-complain /usr/lib/ipsec/stroke
sudo ipsec restart
sleep 0.5s
sudo swanctl --load-all
sudo swanctl -i --child vpn-student
EOF
sudo chmod 755 "/home/${user_name}/vpnon.sh"
echo "sudo swanctl -t --ike vpn-student" > "/home/${user_name}/vpnoff.sh"
sudo chmod 755 "/home/${user_name}/vpnoff.sh"
sudo ln -s "/home/${user_name}/vpnon.sh" "/usr/sbin/vpnon"
sudo ln -s "/home/${user_name}/vpnoff.sh" "/usr/sbin/vpnoff"