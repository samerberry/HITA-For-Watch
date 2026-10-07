$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $env:TEMP 'hita-watch-android-check'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$artifacts = @{
  'wear.aar' = 'https://developer.huawei.com/repo/com/huawei/hms/wearengine/5.0.2.306/wearengine-5.0.2.306.aar'
  'tasks.aar' = 'https://developer.huawei.com/repo/com/huawei/hmf/tasks/1.4.1.300/tasks-1.4.1.300.aar'
  'android.jar' = 'https://repo.maven.apache.org/maven2/com/google/android/android/4.1.1.4/android-4.1.1.4.jar'
  'json.jar' = 'https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar'
}
foreach ($entry in $artifacts.GetEnumerator()) {
  $target = Join-Path $cache $entry.Key
  if (-not (Test-Path -LiteralPath $target)) {
    Invoke-WebRequest -Uri $entry.Value -OutFile $target
  }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($name in @('wear', 'tasks')) {
  $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $cache "$name.aar"))
  try { [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('classes.jar'), (Join-Path $cache "$name.jar"), $true) }
  finally { $zip.Dispose() }
}
$classes = Join-Path $root 'artifacts/android-classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$jbr = 'C:\Program Files\Huawei\DevEco Studio\jbr\bin'
if ($env:JAVA_HOME) { $jbr = Join-Path $env:JAVA_HOME 'bin' }
$classpath = ($artifacts.Keys | Where-Object { $_ -like '*.jar' } | ForEach-Object { Join-Path $cache $_ }) -join ';'
$classpath += ";$cache\wear.jar;$cache\tasks.jar"
$sources = Get-ChildItem -LiteralPath (Join-Path $root 'android-bridge/src/main/java/cn/berry/hita/watchbridge') -Filter '*.java'
& (Join-Path $jbr 'javac.exe') -encoding UTF-8 --release 11 -classpath $classpath -d $classes $sources.FullName (Join-Path $root 'tests/java/ProtocolHarness.java')
if ($LASTEXITCODE -ne 0) { throw 'Android bridge Java/API compilation failed' }
$env:HITA_JAVA = Join-Path $jbr 'java.exe'
$env:HITA_JAVA_CLASSPATH = "$classes;$cache\json.jar"
& node (Join-Path $root 'scripts/test-cross-platform.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cross-platform protocol verification failed' }
