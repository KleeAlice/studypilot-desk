[CmdletBinding()]
param(
    [switch]$AcceptAndroidLicenses
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ToolingRoot = Join-Path $RepoRoot ".tooling"
$JdkRoot = Join-Path $ToolingRoot "jdk-21"
$SdkRoot = Join-Path $ToolingRoot "android-sdk"
$GradleRoot = Join-Path $ToolingRoot "gradle-home"

New-Item -ItemType Directory -Force -Path $ToolingRoot, $JdkRoot, $SdkRoot, $GradleRoot | Out-Null

$Java = Get-ChildItem -Path $JdkRoot -Filter java.exe -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\bin\java.exe" } |
    Select-Object -First 1

if (-not $Java) {
    Write-Host "Downloading verified Eclipse Temurin JDK 21..."
    $AssetsUri = "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"
    $Assets = Invoke-RestMethod -Uri $AssetsUri
    $Package = $Assets[0].binary.package
    $JdkArchive = Join-Path $ToolingRoot "jdk-21.zip"
    Invoke-WebRequest -Uri $Package.link -OutFile $JdkArchive
    $ActualJdkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $JdkArchive).Hash.ToLowerInvariant()
    if ($ActualJdkHash -ne $Package.checksum.ToLowerInvariant()) {
        throw "JDK archive checksum mismatch."
    }
    Expand-Archive -LiteralPath $JdkArchive -DestinationPath $JdkRoot -Force
    Remove-Item -LiteralPath $JdkArchive -Force
    $Java = Get-ChildItem -Path $JdkRoot -Filter java.exe -File -Recurse |
        Where-Object { $_.FullName -like "*\bin\java.exe" } |
        Select-Object -First 1
}

if (-not $Java) {
    throw "Portable JDK installation did not produce java.exe."
}

$JavaHome = Split-Path -Parent (Split-Path -Parent $Java.FullName)
$env:JAVA_HOME = $JavaHome
$env:PATH = "$(Join-Path $JavaHome 'bin');$env:PATH"
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:GRADLE_USER_HOME = $GradleRoot

$SdkManager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path -LiteralPath $SdkManager)) {
    Write-Host "Downloading Google Android command-line tools..."
    $ToolsArchive = Join-Path $ToolingRoot "android-command-line-tools.zip"
    $ToolsUri = "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip"
    if (-not (Test-Path -LiteralPath $ToolsArchive)) {
        Invoke-WebRequest -Uri $ToolsUri -OutFile $ToolsArchive
    }
    $ExpectedSha1 = "16b3f45ddb3d85ea6bbe6a1c0b47146daf0db450"
    $ActualSha1 = (Get-FileHash -Algorithm SHA1 -LiteralPath $ToolsArchive).Hash.ToLowerInvariant()
    if ($ActualSha1 -ne $ExpectedSha1) {
        throw "Android command-line tools checksum mismatch."
    }
    $CmdlineRoot = Join-Path $SdkRoot "cmdline-tools"
    New-Item -ItemType Directory -Force -Path $CmdlineRoot | Out-Null
    & "$env:SystemRoot\System32\tar.exe" -xf $ToolsArchive -C $CmdlineRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Android command-line tools extraction failed with exit code $LASTEXITCODE."
    }
    $ExtractedRoot = Join-Path $CmdlineRoot "cmdline-tools"
    if (-not (Test-Path -LiteralPath $ExtractedRoot)) {
        throw "Android command-line tools archive layout is unexpected."
    }
    Rename-Item -LiteralPath $ExtractedRoot -NewName "latest"
    Remove-Item -LiteralPath $ToolsArchive -Force
}

if (-not $AcceptAndroidLicenses) {
    throw "Android SDK licenses were not accepted. Re-run with -AcceptAndroidLicenses after reviewing Google's SDK license."
}

Write-Host "Accepting Android SDK licenses and installing the minimal API 36 toolchain..."
(1..20 | ForEach-Object { "y" }) | & $SdkManager --sdk_root=$SdkRoot --licenses | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Android SDK license step failed with exit code $LASTEXITCODE."
}

& $SdkManager --sdk_root=$SdkRoot "platform-tools" "platforms;android-36" "build-tools;36.0.0"
if ($LASTEXITCODE -ne 0) {
    throw "Android SDK package installation failed with exit code $LASTEXITCODE."
}

$LocalProperties = Join-Path $RepoRoot "mobile\android\local.properties"
$NativeJavaHome = $env:JAVA_HOME
$NativePath = $env:PATH
$NativeSdkRoot = $SdkRoot
$NativeGradleRoot = $GradleRoot
$BuildRoot = $RepoRoot
$BuildDrive = $null

try {
    Push-Location $RepoRoot
    try {
        & npm.cmd run mobile:sync
        if ($LASTEXITCODE -ne 0) {
            throw "Capacitor sync failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if ($RepoRoot -match "[^\x00-\x7F]") {
        $BuildDrive = @("M", "N", "P", "Q", "R") |
            Where-Object { -not (Get-PSDrive -Name $_ -ErrorAction SilentlyContinue) } |
            Select-Object -First 1
        if (-not $BuildDrive) {
            throw "No free drive letter is available for the ASCII Android build path."
        }
        $Subst = Join-Path $env:SystemRoot "System32\subst.exe"
        & $Subst "$BuildDrive`:" $RepoRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Could not create the temporary $BuildDrive`: Android build mapping."
        }
        $BuildRoot = "$BuildDrive`:\"
        $MappedPrefix = $BuildRoot.TrimEnd("\")
        $env:JAVA_HOME = $NativeJavaHome.Replace($RepoRoot, $MappedPrefix)
        $env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$env:PATH"
        $env:ANDROID_HOME = "$MappedPrefix\.tooling\android-sdk"
        $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
        $env:GRADLE_USER_HOME = "$MappedPrefix\.tooling\gradle-home"
    }

    $BuildSdkRoot = $env:ANDROID_SDK_ROOT -replace "\\", "/"
    Set-Content -LiteralPath $LocalProperties -Encoding UTF8 -Value "sdk.dir=$BuildSdkRoot"
    Push-Location (Join-Path $BuildRoot "mobile\android")
    try {
        & .\gradlew.bat testDebugUnitTest assembleDebug --no-daemon
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle Android tests or APK build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:JAVA_HOME = $NativeJavaHome
    $env:PATH = $NativePath
    $env:ANDROID_HOME = $NativeSdkRoot
    $env:ANDROID_SDK_ROOT = $NativeSdkRoot
    $env:GRADLE_USER_HOME = $NativeGradleRoot
    $NormalizedSdkRoot = $NativeSdkRoot -replace "\\", "/"
    Set-Content -LiteralPath $LocalProperties -Encoding UTF8 -Value "sdk.dir=$NormalizedSdkRoot"
    if ($BuildDrive) {
        $Subst = Join-Path $env:SystemRoot "System32\subst.exe"
        & $Subst "$BuildDrive`:" /D | Out-Null
    }
}

$Apk = Join-Path $RepoRoot "mobile\android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path -LiteralPath $Apk)) {
    throw "Gradle completed without producing the expected debug APK."
}

$ApkInfo = Get-Item -LiteralPath $Apk
$ApkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Apk).Hash.ToLowerInvariant()
Write-Host "APK=$($ApkInfo.FullName)"
Write-Host "APK_BYTES=$($ApkInfo.Length)"
Write-Host "APK_SHA256=$ApkHash"
