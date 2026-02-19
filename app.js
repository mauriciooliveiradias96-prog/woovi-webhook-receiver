const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Middleware para processar JSON
app.use(express.json());

// Configurações
const WEBHOOKS_FILE = path.join(__dirname, 'webhooks.json');
const PORT = process.env.PORT || 3000;

// Carregar webhooks salvos ao iniciar
let webhooks = [];
if (fs.existsSync(WEBHOOKS_FILE)) {
    try {
        const data = fs.readFileSync(WEBHOOKS_FILE, 'utf8');
        webhooks = JSON.parse(data);
        console.log(`📂 Carregados ${webhooks.length} webhooks do arquivo`);
    } catch (e) {
        console.error('❌ Erro ao carregar webhooks:', e.message);
        webhooks = [];
    }
}

// Função para salvar webhooks em arquivo
function salvarWebhooks() {
    try {
        fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2));
        return true;
    } catch (e) {
        console.error('❌ Erro ao salvar webhooks:', e.message);
        return false;
    }
}

// Rota principal - teste
app.get('/', (req, res) => {
    res.send(`
        <h1>🚀 Webhook Receiver - Online</h1>
        <p>Webhooks armazenados: <strong>${webhooks.length}</strong></p>
        <p><a href="/status">Ver status</a></p>
        <p><a href="/get-webhooks">Buscar webhooks (limpa a lista)</a></p>
    `);
});

// Rota para receber webhooks da Woovi (POST)
app.post('/webhook', (req, res) => {
    const timestamp = new Date().toISOString();
    
    // Criar objeto do webhook
    const webhookData = {
        timestamp: timestamp,
        headers: req.headers,
        body: req.body
    };
    
    // Adicionar à lista
    webhooks.push(webhookData);
    
    // Manter apenas os últimos 200 (para não ocupar muito espaço)
    if (webhooks.length > 200) {
        webhooks = webhooks.slice(-200);
    }
    
    // Salvar em arquivo
    const salvou = salvarWebhooks();
    
    console.log(`✅ [${timestamp}] Webhook recebido:`);
    console.log(`   Evento: ${req.body.event || 'desconhecido'}`);
    console.log(`   CorrelationID: ${req.body.charge?.correlationID || req.body.correlationID || 'N/A'}`);
    console.log(`   Valor: ${req.body.charge?.value || req.body.value || 0} centavos`);
    console.log(`   Total na fila: ${webhooks.length}`);
    console.log(`   Persistido: ${salvou ? 'sim' : 'não'}`);
    
    // Responder 200 (obrigatório)
    res.status(200).send('OK');
});

// Rota para seu site buscar os webhooks (GET)
app.get('/get-webhooks', (req, res) => {
    const quantidade = webhooks.length;
    
    // Criar cópia e limpar a lista
    const webhooksParaEnviar = [...webhooks];
    webhooks = [];
    
    // Salvar lista vazia no arquivo
    salvarWebhooks();
    
    console.log(`📤 Enviados ${quantidade} webhooks e limpada a fila`);
    
    // Retornar os webhooks
    res.json(webhooksParaEnviar);
});

// Rota para ver status (útil para debug)
app.get('/status', (req, res) => {
    // Extrair informações resumidas dos webhooks
    const resumo = webhooks.map(w => ({
        timestamp: w.timestamp,
        event: w.body.event,
        correlationID: w.body.charge?.correlationID || w.body.correlationID,
        valor: w.body.charge?.value || w.body.value
    }));
    
    res.json({
        status: 'online',
        webhooks_armazenados: webhooks.length,
        webhooks_resumo: resumo.slice(-10), // últimos 10
        arquivo_existe: fs.existsSync(WEBHOOKS_FILE),
        arquivo_tamanho: fs.existsSync(WEBHOOKS_FILE) ? fs.statSync(WEBHOOKS_FILE).size : 0
    });
});

// Rota para testar (simula um webhook)
app.post('/testar', (req, res) => {
    const webhookTeste = {
        event: "OPENPIX:CHARGE_COMPLETED",
        charge: {
            correlationID: "DEP_1_123456789_test",
            value: 100,
            status: "COMPLETED"
        }
    };
    
    // Processar como se fosse um webhook real
    req.body = webhookTeste;
    
    // Chamar a mesma lógica
    const timestamp = new Date().toISOString();
    
    const webhookData = {
        timestamp: timestamp,
        headers: req.headers,
        body: webhookTeste
    };
    
    webhooks.push(webhookData);
    
    if (webhooks.length > 200) {
        webhooks = webhooks.slice(-200);
    }
    
    salvarWebhooks();
    
    res.json({
        success: true,
        message: 'Webhook de teste adicionado',
        total_webhooks: webhooks.length
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📁 Arquivo de webhooks: ${WEBHOOKS_FILE}`);
    console.log(`📊 Webhooks carregados: ${webhooks.length}`);
    console.log(`\nRotas disponíveis:`);
    console.log(`   GET  /            - Página inicial`);
    console.log(`   POST /webhook     - Receber webhooks da Woovi`);
    console.log(`   GET  /get-webhooks - Buscar webhooks (limpa a lista)`);
    console.log(`   GET  /status       - Ver status do servidor`);
    console.log(`   POST /testar       - Adicionar webhook de teste`);
});
