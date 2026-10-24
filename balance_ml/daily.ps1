param([int]$Games=5000)
$ErrorActionPreference='Stop'
if ($Games -notin @(5000,10000)) { throw 'Daily budget must be 5000 or 10000 full games' }
$repo=Split-Path $PSScriptRoot -Parent
$python='C:\Users\pc\aGe-ai\.venv\Scripts\python.exe'
$runs=Join-Path $PSScriptRoot 'runs'
New-Item -ItemType Directory -Force $runs | Out-Null
$lock=Join-Path $runs 'agent.lock'
if (Test-Path -LiteralPath $lock) { Write-Output 'Existing agent lock: inspect status; no duplicate launch'; exit 0 }
$runName=Get-Date -Format 'yyyy-MM-dd'
# Resume the latest interrupted matching-budget run before creating another daily batch.
$pending=Get-ChildItem -LiteralPath $runs -Directory | Sort-Object Name -Descending | Where-Object {
    $manifest=Join-Path $_.FullName 'manifest.json'
    $progress=Join-Path $_.FullName 'progress.json'
    if ((Test-Path $manifest) -and (Test-Path $progress)) {
        $m=Get-Content $manifest -Raw | ConvertFrom-Json
        $p=Get-Content $progress -Raw | ConvertFrom-Json
        $m.budget -eq $Games -and $p.state -eq 'paused'
    }
} | Select-Object -First 1
if ($pending) { $runName=$pending.Name }
$runPath=Join-Path $runs $runName
$report=Join-Path $runPath 'report.json'
if (Test-Path -LiteralPath $report) { Write-Output "Already completed: $report"; exit 0 }
New-Item -ItemType Directory -Force $runPath | Out-Null
$env:TEMP=$runs; $env:TMP=$runs
$arguments=@('-m','balance_ml.agent','--run',$runName,'--games',"$Games",'--max-seconds','21600')
$process=Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runPath 'stdout.log') -RedirectStandardError (Join-Path $runPath 'stderr.log') -PassThru
Write-Output "Started local balance agent PID=$($process.Id), run=$runName, budget=$Games"
