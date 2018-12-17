$package = 'OpenSSL102-choco'

try {

  #default is to plop in c:\ -- yuck!
  $installDir = 'C:\OpenSSL-Win64\'

  $params = @{
    packageName = $package;
    fileType = 'exe';
    #InnoSetup - http://unattended.sourceforge.net/InnoSetup_Switches_ExitCodes.html
    silentArgs = '/silent', '/verysilent', '/sp-', '/suppressmsgboxes',
      "/DIR=`"$installDir`"";
    url = 'https://slproweb.com/download/Win32OpenSSL-1_0_2q.exe'
    url64bit = 'https://slproweb.com/download/Win64OpenSSL-1_0_2q.exe'
  }

  Install-ChocolateyPackage @params

  if (!$Env:OPENSSL_CONF)
  {
    $configPath = Join-Path $installDir 'bin\openssl.cfg'

    if (Test-Path $configPath)
    {
      [Environment]::SetEnvironmentVariable(
        'OPENSSL_CONF', $configPath, 'User')

      Write-Host "Configured OPENSSL_CONF variable as $configPath"
    }
  }

  Write-ChocolateySuccess $package
} catch {
  Write-ChocolateyFailure $package "$($_.Exception.Message)"
  throw
}
