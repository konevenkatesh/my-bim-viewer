# My BIM Viewer

A Building Information Modeling (BIM) IFC viewer web application built with Vite, Three.js, and FastAPI. Upload, visualize, and interact with IFC (Industry Foundation Classes) models in 3D.

## Features

- **3D IFC Model Viewing**: Load and visualize IFC files in an interactive 3D environment
- **Backend Processing**: Python backend with ifcopenshell for robust IFC data extraction
- **Element Selection**: Click on elements to view detailed properties and property sets
- **Multiple Models**: Load and manage multiple IFC models simultaneously
- **Property Inspection**: View element properties, property sets (Psets), and quantities
- **Web Application**: Modern web application accessible from any browser

## Tech Stack

### Frontend
- **Vite**: Lightning-fast build tool and dev server
- **Three.js**: 3D rendering engine
- **@thatopen/components**: BIM-specific 3D components
- **@thatopen/ui**: UI components for BIM applications

### Backend
- **FastAPI**: Modern Python web framework
- **ifcopenshell**: IFC file parsing and processing
- **uvicorn**: ASGI server

## Installation

### Prerequisites
- Node.js (v16 or higher)
- Python 3.11 or higher
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd my-bim-viewer
```

2. Install frontend dependencies:
```bash
npm install
```

3. Setup Python backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Running the Application

### Development Mode

Run both frontend and backend together:
```bash
npm run dev
```

This will start:
- Frontend (Vite): `http://localhost:5173/` (opens automatically in your browser)
- Backend (FastAPI): `http://localhost:8000`

### Individual Services

Run backend only:
```bash
npm run backend
```

Run frontend only:
```bash
npm run frontend
```

### Production Build

```bash
npm run build
```

## Usage

1. **Launch the application** using `npm run dev`
2. **Upload an IFC file** using the file input in the left panel
3. **Navigate the 3D view**:
   - Left-click and drag to rotate
   - Right-click and drag to pan
   - Scroll to zoom
4. **Select elements** by left-clicking on them
5. **View properties** in the "Element Properties" panel
6. **Manage models** using the "Loaded Models" section

## API Endpoints

The backend provides the following REST API endpoints:

- `POST /upload-ifc` - Upload and process IFC file
- `POST /get-element-by-guid` - Get element details by GUID
- `DELETE /remove-model/{model_id}` - Remove a loaded model
- `GET /models` - List all loaded models
- `GET /` - API documentation

## Project Structure

```
my-bim-viewer/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── venv/               # Python virtual environment
├── src/
│   └── main.js             # Frontend application code
├── public/                 # Static assets (WASM files, worker.mjs)
├── index.html              # HTML entry point
├── package.json            # Node.js dependencies
└── vite.config.js          # Vite configuration
```

## Dependencies

### Frontend Dependencies
- `@thatopen/components`: ^3.2.2
- `@thatopen/fragments`: ^3.2.0
- `@thatopen/ui`: ^3.2.0
- `three`: ^0.181.0
- `stats.js`: ^0.17.0
- `web-ifc`: ^0.0.72

### Backend Dependencies
- `fastapi`
- `uvicorn[standard]`
- `python-multipart`
- `ifcopenshell`
- `pydantic`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your chosen license]

## Acknowledgments

- Built with [That Open Company](https://thatopen.com/) BIM tools
- IFC processing powered by [ifcopenshell](http://ifcopenshell.org/)
- 3D rendering with [Three.js](https://threejs.org/)