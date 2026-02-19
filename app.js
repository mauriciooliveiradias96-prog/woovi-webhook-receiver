// Importa o Express.js (será instalado depois)
const express = require('express');

// Cria o aplicativo Express
const app = express();

// Middleware para processar JSON
app.use(express.json());

// Porta que o Render vai usar (obrigatório)
const port = process.env.PORT || 3000;

// Token de verificação (opcional, mas recomendado para segurança)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'minha_chave_secreta_123';

// Array para armazenar os webhooks recebidos
let webhooks = [];

// Rota GET para verificação (útil para testes)
app.get('/', (req, res) => {
  res.send('Webhook receiver está funcionando!');
});

// Rota POST para receber webhooks da Woovi
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString();
  const webhookData = {
    timestamp: timestamp,
    headers: req.headers,
    body: req.body
  };
  
  // Adiciona ao array (guarda na memória)
  webhooks.push(webhookData);
  
  // Limita o array a 100 itens (para não estourar a memória)
  if (webhooks.length > 100) {
    webhooks.shift();
  }
  
  console.log(`[${timestamp}] Webhook recebido:`);
  console.log(JSON.stringify(req.body, null, 2));
  
  // Responde 200 para a Woovi (obrigatório)
  res.status(200).send('OK');
});

// Rota GET para o site InfinityFree buscar os webhooks
app.get('/get-webhooks', (req, res) => {
  // Cria uma cópia do array
  const webhooksCopy = [...webhooks];
  
  // Limpa o array original (já que vai ser processado)
  webhooks = [];
  
  res.json(webhooksCopy);
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
