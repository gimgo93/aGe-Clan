$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$python='C:\Users\pc\aGe-ai\.venv\Scripts\python.exe'
$runs=Join-Path $PSScriptRoot 'runs'
New-Item -ItemType Directory -Force $runs | Out-Null
if(Test-Path (Join-Path $runs 'agent.lock')) { Write-Output 'Existing agent lock; no duplicate launch'; exit 0 }
$day=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'Korea Standard Time').ToString('yyyy-MM-dd')
if(Test-Path (Join-Path $runs "$day\manifest.json")) { Write-Output 'Legacy daily budget already reserved; do not launch another batch'; exit 0 }
$runPath=Join-Path $runs "$day-frontier50"
New-Item -ItemType Directory -Force $runPath | Out-Null
if(Test-Path (Join-Path $runPath 'progress.json')) {
 $progress=Get-Content (Join-Path $runPath 'progress.json') -Raw | ConvertFrom-Json
 if($progress.state -eq 'complete') { Write-Output 'Campaign already complete'; exit 0 }
}
$env:TEMP=$runs; $env:TMP=$runs
$stamp=Get-Date -Format 'HHmmssfff'
$process=Start-Process -FilePath $python -ArgumentList @('-m','balance_ml.campaign','--day',$day) -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runPath "stdout-$stamp.log") -RedirectStandardError (Join-Path $runPath "stderr-$stamp.log") -PassThru
Write-Output "Started bounded frontier/ML campaign PID=$($process.Id)"
