cd ..
git pull
pnpm install
pnpm build
cp -rf ./dist/ /var/www/
rm -rf /var/www/www
mv /var/www/dist /var/www/www