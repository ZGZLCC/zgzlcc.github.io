git pull
pnpm install
pnpm build
sudo cp -rf ./dist/ /var/www/
sudo rm -rf /var/www/www
sudo mv /var/www/dist /var/www/www