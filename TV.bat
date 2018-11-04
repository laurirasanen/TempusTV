cd /d "..\DemoTools"
git pull
call npm i

cd /d "..\TempusTV"
git pull
call npm i

node "app.js"
pause