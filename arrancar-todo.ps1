# Abre en Windows Terminal una ventana con una pestaña de color por cada pieza del proyecto:
#
#   Docker / MongoDB · Mosquitto · Subscriber · API · Node-RED · Mirar p1
#
# Uso (desde la raíz del repo, o con doble clic en arrancar-todo.cmd):
#   .\arrancar-todo.ps1              arranca todo con la base de datos vacía (seed --limpiar): sin alertas
#                                    de la sesión anterior, como los SIN_SENAL que deja al cerrar
#   .\arrancar-todo.ps1 -Conservar   arranca sin vaciar la base de datos (-Limpiar se sigue aceptando, pero ya es lo normal)
#   .\arrancar-todo.ps1 -Jugador p8  la última pestaña vigila a p8 en vez de a p1
#   .\arrancar-todo.ps1 -SinNavegador   no abre las páginas en el navegador
#
# - Si el servicio de Windows de Mosquitto está arrancado, lo para primero (pide permiso de administrador una vez).
# - Docker Desktop se arranca a mano: si no está listo, la pestaña de Docker espera a que lo abras.
# - Cuando la API y Node-RED responden, abre en el navegador el campograma (http://localhost:3000), la botonera
#   de simulación (/control.html), el editor de Node-RED con todos los flujos (http://localhost:1880) y el
#   dashboard médico (http://localhost:1880/dashboard/medico).
# - Node-RED carga solo los flujos del repo si son más nuevos que los suyos (ver node_red/arrancar.js).
# - Cada pestaña tiene su propio historial de comandos (en ~/.smarthealth/historial). Cuando pares lo que se
#   esté ejecutando (Ctrl+C), pulsa ↑ y salen los comandos de esa parte; lo que escribas se guarda para la próxima vez.
# - Todas las pestañas cargan el .env, así que en los comandos puedes usar $env:NODERED_MQTT_PASS, etc.
# - Para pararlo todo, cierra la ventana. Después, si quieres, vuelve a dejar el servicio con:  net start mosquitto

param(
    [string]$Pieza = '',
    [switch]$Limpiar,      # ya es lo normal; se acepta para no romper los comandos de antes
    [switch]$Conservar,
    [string]$Jugador = 'p1',
    [switch]$SinNavegador
)
$Limpiar = -not $Conservar

$Repo = $PSScriptRoot
$Mosquitto = 'C:\Program Files\mosquitto'
$CarpetaHistorial = Join-Path $env:USERPROFILE '.smarthealth\historial'

# Comandos con los que empieza el historial de cada pestaña (el último es el primero que sale al pulsar ↑)
$ComandosIniciales = @{
    docker     = @(
        'docker compose down',
        'docker ps',
        'docker exec -it smarthealth-mongo mongosh smarthealth',
        'docker compose up -d'
    )
    mosquitto  = @(
        "& '$Mosquitto\mosquitto.exe' -c mosquitto/mosquitto.conf -v"
    )
    subscriber = @(
        "& '$Mosquitto\mosquitto_sub.exe' -h localhost -u `$env:NODERED_MQTT_USER -P `$env:NODERED_MQTT_PASS -t 'control/#' -v",
        "& '$Mosquitto\mosquitto_sub.exe' -h localhost -u `$env:NODERED_MQTT_USER -P `$env:NODERED_MQTT_PASS -t 'equipo/estado' -v",
        "& '$Mosquitto\mosquitto_sub.exe' -h localhost -u `$env:NODERED_MQTT_USER -P `$env:NODERED_MQTT_PASS -t 'p1/sensors/#' -v",
        "& '$Mosquitto\mosquitto_sub.exe' -h localhost -u `$env:NODERED_MQTT_USER -P `$env:NODERED_MQTT_PASS -t 'sensors/eq1/alertas' -v",
        "& '$Mosquitto\mosquitto_sub.exe' -h localhost -u `$env:NODERED_MQTT_USER -P `$env:NODERED_MQTT_PASS -t '#' -v"
    )
    api        = @(
        'node scripts/seed.js --limpiar',
        'node scripts/seed.js',
        'npm test',
        'npm run dev'
    )
    nodered    = @(
        'node node_red/arrancar.js --reiniciar',
        'node node_red/arrancar.js'
    )
    mirar      = @(
        'Invoke-RestMethod -Method Delete -Uri http://localhost:3000/api/simulador/jugadores/p8/sensores',
        'Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/simulador/jugadores/p8/sensores -ContentType application/json -Body ''{"temperature": 40.5, "durationSeconds": 60}''',
        'Start-Process http://localhost:3000/api-docs',
        'Start-Process http://localhost:3000',
        "Invoke-RestMethod 'http://localhost:3000/api/alertas?estado=activa' | Format-Table jugadorId, codigo, severidad, mensaje",
        "Invoke-RestMethod 'http://localhost:3000/api/jugadores/p1/historico' | Format-Table ts, velMedia, distancia, fcMedia, temp, asimetria",
        'Invoke-RestMethod http://localhost:3000/health',
        'node scripts/vigilar.js p8',
        'node scripts/vigilar.js p1'
    )
}

function Cargar-Env {
    $ruta = Join-Path $Repo '.env'
    if (-not (Test-Path $ruta)) { Write-Warning 'No hay .env en la raíz del repo'; return }
    foreach ($linea in Get-Content $ruta) {
        if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            Set-Item -Path ("env:" + $Matches[1]) -Value $Matches[2].Trim()
        }
    }
}

# Historial propio de cada pestaña: se carga de ~/.smarthealth/historial/<pieza>.txt y lo que se escriba se guarda ahí
function Preparar-Historial($nombre) {
    try {
        Import-Module PSReadLine -ErrorAction Stop
        New-Item -ItemType Directory -Force -Path $CarpetaHistorial | Out-Null
        $archivo = Join-Path $CarpetaHistorial "$nombre.txt"
        if (-not (Test-Path $archivo)) {
            Set-Content -Path $archivo -Value $ComandosIniciales[$nombre] -Encoding UTF8
        } else {
            # Si el lanzador trae comandos nuevos, se añaden al principio (los más antiguos) sin tocar los tuyos
            $tuyos = @(Get-Content $archivo -Encoding UTF8)
            $nuevos = @($ComandosIniciales[$nombre] | Where-Object { $tuyos -notcontains $_ })
            if ($nuevos.Count) { Set-Content -Path $archivo -Value ($nuevos + $tuyos) -Encoding UTF8 }
        }
        Set-PSReadLineOption -HistorySaveStyle SaveNothing
        [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory()
        foreach ($comando in (Get-Content $archivo -Encoding UTF8)) {
            if ($comando.Trim()) { [Microsoft.PowerShell.PSConsoleReadLine]::AddToHistory($comando) }
        }
        Set-PSReadLineOption -HistorySavePath $archivo -HistorySaveStyle SaveIncrementally -HistoryNoDuplicates
    } catch {
        Write-Warning "No se pudo preparar el historial de esta pestaña: $($_.Exception.Message)"
    }
}

function Titulo($texto) {
    Write-Host ''
    Write-Host "  $texto" -ForegroundColor Cyan
    Write-Host '  (Ctrl+C para parar; después, ↑ muestra los comandos de esta pestaña)' -ForegroundColor DarkGray
    Write-Host ''
}

# ---------------------------------------------------------------- piezas (una por pestaña)

if ($Pieza) {
    Cargar-Env
    Preparar-Historial $Pieza
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
}

switch ($Pieza) {
    'docker' {
        Titulo 'Docker / MongoDB'
        # Docker Desktop se arranca a mano; aquí solo se espera a que esté listo
        docker info *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Docker Desktop no está arrancado: ábrelo y espero a que esté listo...' -ForegroundColor Yellow
            do {
                Start-Sleep -Seconds 3
                docker info *> $null
            } while ($LASTEXITCODE -ne 0)
        }
        Set-Location $Repo
        docker compose up -d
        if ($Limpiar) {
            Write-Host ''
            Write-Host 'Vaciando la base de datos (seed --limpiar)...'
            Push-Location (Join-Path $Repo 'api')
            node scripts/seed.js --limpiar
            Pop-Location
        }
        Write-Host ''
        docker ps --filter name=smarthealth --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
        return
    }
    'mosquitto' {
        Titulo 'Mosquitto (configuración del proyecto: usuarios y ACL)'
        Set-Location $Repo
        & "$Mosquitto\mosquitto.exe" -c mosquitto/mosquitto.conf -v
        return
    }
    'subscriber' {
        Titulo 'Todo lo que pasa por el broker (#)'
        Set-Location $Repo
        Start-Sleep -Seconds 2   # deja que Mosquitto arranque
        & "$Mosquitto\mosquitto_sub.exe" -h localhost -u $env:NODERED_MQTT_USER -P $env:NODERED_MQTT_PASS -t '#' -v
        return
    }
    'api' {
        Titulo 'API REST (npm run dev)'
        Set-Location (Join-Path $Repo 'api')
        npm run dev
        return
    }
    'nodered' {
        Titulo 'Node-RED: simulador de A + pasarela (http://localhost:1880)'
        Set-Location $Repo
        node node_red/arrancar.js
        return
    }
    'mirar' {
        Titulo "Estado de $Jugador visto por la API"
        Set-Location (Join-Path $Repo 'api')
        # Espera a la API y a Node-RED (Docker y MongoDB pueden tardar en arrancar) y abre las páginas en el navegador.
        # Se comprueba con 127.0.0.1: Node-RED solo escucha en IPv4 y Windows PowerShell prueba antes ::1 con localhost,
        # así que cada intento agotaba los 2 s y nunca se daba por arrancado.
        function Esperar($nombre, $url) {
            Write-Host "Esperando a $nombre..." -ForegroundColor DarkGray
            for ($i = 0; $i -lt 90; $i++) {
                try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { Start-Sleep -Seconds 2 }
            }
            Write-Warning "$nombre no responde en $url"
            return $false
        }
        $api = Esperar 'la API' 'http://127.0.0.1:3000/health'
        $nodered = Esperar 'Node-RED' 'http://127.0.0.1:1880/dashboard/medico'
        if (-not $SinNavegador) {
            $paginas = @()
            if ($api)     { $paginas += 'http://localhost:3000', 'http://localhost:3000/control.html' }
            if ($nodered) { $paginas += 'http://localhost:1880', 'http://localhost:1880/dashboard/medico' }
            foreach ($p in $paginas) {
                Write-Host "Abriendo $p" -ForegroundColor Cyan
                Start-Process $p
            }
        }
        node scripts/vigilar.js $Jugador
        return
    }
}

# ---------------------------------------------------------------- sin -Pieza: abrir la ventana con todas las pestañas

if ((Get-Service mosquitto -ErrorAction SilentlyContinue).Status -eq 'Running') {
    Write-Host 'Parando el servicio de Windows de Mosquitto (pide permiso de administrador)...'
    Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command Stop-Service mosquitto'
}

$script = Join-Path $Repo 'arrancar-todo.ps1'
$extra = ''
if ($Conservar) { $extra = ' -Conservar' }
$extraMirar = " -Jugador $Jugador"
if ($SinNavegador) { $extraMirar += ' -SinNavegador' }

function Pestana($titulo, $color, $pieza, $parametros = '') {
    return "new-tab --title `"$titulo`" --tabColor `"$color`" --suppressApplicationTitle -d `"$Repo`" " +
        "powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Pieza $pieza$parametros"
}

$pestanas = @(
    (Pestana 'Docker / MongoDB' '#0B6FB8' 'docker' $extra),
    (Pestana 'Mosquitto'        '#6B2D7B' 'mosquitto'),
    (Pestana 'Subscriber'       '#2E6B30' 'subscriber'),
    (Pestana 'API'              '#8B1E2E' 'api'),
    (Pestana 'Node-RED'         '#B5452B' 'nodered'),
    (Pestana "Mirar $Jugador"   '#1F4E79' 'mirar' $extraMirar)
)

Start-Process wt -ArgumentList ('--window new ' + ($pestanas -join ' ; '))
Write-Host 'Abierta la ventana de Windows Terminal con todo el proyecto.'
if (-not $SinNavegador) { Write-Host 'Cuando la API y Node-RED estén listos se abrirán el campograma, la botonera, el editor de Node-RED y el dashboard médico.' }
