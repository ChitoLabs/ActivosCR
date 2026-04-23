# ActivosCR - Sistema de Control de Activos Electrónicos

Sistema web para la gestión y control de activos electrónicos de una empresa. Permite administrar inventario, importar/exportar datos desde Excel, generar PDFs de baja de activos, y personalizar el branding.

## Características

- 🔐 **Autenticación JWT** con cambio obligatorio de contraseña en primer acceso
- 📦 **Gestión de Activos** - CRUD completo con búsqueda y filtros
- 📊 **Dashboard** con estadísticas en tiempo real
- 📥 **Importar/Exportar Excel** - Carga masiva de activos
- 📄 **Generación de PDF** - Solicitudes de baja con formato corporativo
- 🎨 **Branding Personalizable** - Logo, colores, fondo de login
- 👥 **Gestión de Usuarios** - Roles admin/operador
- 📝 **Bitácora de Auditoría** - Registro de todas las acciones

## Requisitos

- Docker y Docker Compose instalados
- Puerto 8980 disponible

## Instalación Rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/ChitoLabs/ActivosCR.git
cd ActivosCR
```

### 2. Configurar variables de entorno (opcional)

```bash
cp .env.example .env
# Editar .env si deseas cambiar credenciales
```

### 3. Levantar la aplicación

```bash
docker compose up -d
```

### 4. Acceder

Abre tu navegador en: **http://localhost:8980**

---

## Credenciales por Defecto

| Campo | Valor |
|-------|-------|
| **Usuario** | `admin` |
| **Contraseña** | `admin123` |

⚠️ **Importante:** Al iniciar sesión por primera vez, el sistema te pedirá cambiar la contraseña obligatoriamente.

---

## Fresh Install (Reinstalación Limpia)

Si necesitas una instalación limpia (base de datos vacía):

```bash
# Opción 1: Usar el script incluido
./reset.sh

# Opción 2: Manual
docker compose down
docker volume rm ActivosCR_activos-db
docker compose up -d
```

Esto eliminará:
- Todos los contenedores
- La base de datos SQLite
- Volumen Docker asociado

---

## Configuración de Branding

El sistema permite personalizar:

1. **Logo del sistema** - Aparece en login, sidebar y PDFs
2. **Colores primarios** - Tonos verde teal personalizables
3. **Fondo de login** - Imagen de fondo para la pantalla de acceso
4. **Encabezado PDF** - Texto del encabezado para PDFs de baja

Accede a **Branding** desde el menú lateral (solo admins).

---

## Estructura del Proyecto

```
ActivosCR/
├── backend/              # API Node.js + Express
│   ├── routes/          # Endpoints de la API
│   ├── utils/           # Utilidades (PDF, Excel)
│   ├── middleware/       # Auth, auditoría
│   └── database.js      # Schema de SQLite
├── frontend/            # Frontend estático (HTML/CSS/JS)
│   └── public/         # Archivos públicos
├── data/                # Datos persistentes
│   ├── branding/        # Logos e imágenes cargados
│   ├── sql/            # Base de datos (generada automáticamente)
│   └── uploads/        # Archivos subidos
├── docker-compose.yml  # Configuración Docker
├── reset.sh           # Script para fresh install
└── README.md
```

---

## API Endpoints Principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/assets` | Listar activos |
| POST | `/api/assets/import` | Importar Excel |
| GET | `/api/retirements/:id/pdf` | Generar PDF de baja |
| GET | `/api/branding` | Obtener branding |
| PUT | `/api/branding` | Actualizar branding |

---

## Tecnologías

- **Backend:** Node.js, Express, SQLite, JWT, bcrypt
- **Frontend:** HTML5, CSS3, JavaScript vanilla, Nginx
- **PDF:** jsPDF
- **Excel:** xlsx (SheetJS)
- **Contenedores:** Docker, Docker Compose

---

## Licencia

MIT License

---

## Autor

**ChitoLabs** - https://github.com/ChitoLabs