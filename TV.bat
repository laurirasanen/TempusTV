:: python song request
cd /d %~dp0\..
IF NOT EXIST python_sr (
	git clone https://github.com/laurirasanen/python_sr
)
cd /d ".\python_sr"

:: update song request
git pull
call pip install -r ./requirements.txt

:: run song request
start "python_sr" cmd /c "python ./sr.py"


:: demo tools
cd /d %~dp0\..
IF NOT EXIST .\demotools (
	git clone https://github.com/laurirasanen/demotools
)
cd /d ".\demotools"

:: update demo tools
git pull
call npm i


:: tempustv
cd /d %~dp0\..
IF NOT EXIST .\tempustv (
	git clone https://github.com/laurirasanen/tempustv
)
cd /d ".\tempustv"

:: update tempustv
git pull
call npm i

:: run tempustv
node "app.js"
pause