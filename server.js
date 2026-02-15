require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");

const User = require("./models/User");
const Flow = require("./models/Flow");
const auth = require("./middleware/auth");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// Carpeta para subir archivos multimedia
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Conectar Mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log(err));

/* ===== REGISTER ===== */
app.post("/api/register", async (req,res)=>{
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password,10);
  await User.create({ email, password: hashed });
  res.json({ success:true });
});

/* ===== LOGIN ===== */
app.post("/api/login", async (req,res)=>{
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error:"Usuario no existe" });
  const valid = await bcrypt.compare(password,user.password);
  if (!valid) return res.status(400).json({ error:"Password incorrecto" });
  const token = jwt.sign({ id:user._id },process.env.JWT_SECRET);
  res.json({ token });
});

/* ===== CREAR FLOW ===== */
app.post("/api/flows", auth, async (req,res)=>{
  const flow = await Flow.create({
    userId: req.user.id,
    name: req.body.name,
    nodos: [],
    conexiones: []
  });
  res.json(flow);
});

/* ===== GUARDAR FLOW ===== */
app.post("/api/guardar-flujo", auth, upload.array('files'), async (req,res)=>{
  const data = JSON.parse(req.body.data);

  // Guardar archivos subidos
  data.nodos.forEach(n=>{
    if(n.tipo === 'media'){
      const file = req.files.find(f => f.originalname === n.contenido.archivo.name);
      if(file) n.contenido.archivo = file.filename;
    }
  });

  await Flow.updateOne(
    { _id: data._id, userId: req.user.id },
    { nodos: data.nodos, conexiones: data.conexiones }
  );
  res.json({ success:true });
});

/* ===== CARGAR FLOWS ===== */
app.get("/api/cargar-flujo", auth, async (req,res)=>{
  const flows = await Flow.find({ userId: req.user.id });
  if(flows.length === 0) return res.json({ nodos: [], conexiones: [] });
  // Cargar el primer flujo por simplicidad
  const flow = flows[0];
  res.json({ nodos: flow.nodos, conexiones: flow.conexiones });
});

app.listen(process.env.PORT,()=>{
  console.log("Servidor iniciado");
});
