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
        <p><a href="/consultar-webhooks">🔍 Consultar webhooks (NÃO limpa)</a></p>
        <p><a href="/get-webhooks">📤 Buscar webhooks (NÃO remove)</a></p>
        <p><a href="/get-webhooks?confirmar=true">⚠️ Buscar E REMOVER todos</a></p>
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

// 🔍 Rota para APENAS CONSULTAR (NÃO LIMPA)
app.get('/consultar-webhooks', (req, res) => {
    console.log(`📋 Consulta: ${webhooks.length} webhooks na fila (não foram removidos)`);
    
    // Retornar os webhooks sem limpar
    res.json(webhooks);
});

// 📤 Rota para BUSCAR webhooks (NÃO remove por padrão, só se confirmar=true)
app.get('/get-webhooks', (req, res) => {
    const confirmar = req.query.confirmar === 'true';
    const quantidade = webhooks.length;
    
    // Criar cópia para enviar
    const webhooksParaEnviar = [...webhooks];
    
    if (confirmar) {
        // SÓ remove se confirmar=true
        webhooks = [];
        salvarWebhooks();
        console.log(`📤 Enviados E REMOVIDOS ${quantidade} webhooks (confirmado)`);
    } else {
        console.log(`📤 Enviados ${quantidade} webhooks (NÃO removidos - use ?confirmar=true para remover)`);
    }
    
    res.json(webhooksParaEnviar);
});

// ✅ Rota para CONFIRMAR PROCESSAMENTO (remove apenas os índices específicos)
app.post('/confirmar-processamento', (req, res) => {
    const { indices } = req.body;
    const quantidadeAnterior = webhooks.length;
    
    if (indices && Array.isArray(indices) && indices.length > 0) {
        // Remover apenas os índices específicos que foram processados
        // Ordenar índices de forma decrescente para remover do final para o início
        const indicesOrdenados = [...indices].sort((a, b) => b - a);
        
        for (const indice of indicesOrdenados) {
            if (indice >= 0 && indice < webhooks.length) {
                webhooks.splice(indice, 1);
            }
        }
        
        console.log(`🗑️ Removidos ${indices.length} webhooks processados`);
    } else {
        console.log('⚠️ Nenhum índice especificado, mantendo todos');
    }
    
    salvarWebhooks();
    
    res.json({
        status: 'ok',
        removidos: indices?.length || 0,
        restantes: webhooks.length
    });
});

// ❌ Rota para REMOVER webhooks específicos por correlationID
app.post('/remover-por-correlationid', (req, res) => {
    const { correlationIds } = req.body;
    
    if (!correlationIds || !Array.isArray(correlationIds) || correlationIds.length === 0) {
        return res.json({ status: 'ok', removidos: 0, restantes: webhooks.length });
    }
    
    const antes = webhooks.length;
    
    // Filtrar para manter apenas webhooks cujo correlationID NÃO está na lista
    webhooks = webhooks.filter(webhook => {
        const body = webhook.body || webhook;
        const correlationId = body.charge?.correlationID || body.correlationID;
        return !correlationIds.includes(correlationId);
    });
    
    const removidos = antes - webhooks.length;
    salvarWebhooks();
    
    console.log(`🗑️ Removidos ${removidos} webhooks por correlationID`);
    
    res.json({
        status: 'ok',
        removidos: removidos,
        restantes: webhooks.length
    });
});

// Rota para ver status (útil para debug)
app.get('/status', (req, res) => {
    // Extrair informações resumidas dos webhooks
    const resumo = webhooks.map((w, index) => ({
        index: index,
        timestamp: w.timestamp,
        event: w.body.event,
        correlationID: w.body.charge?.correlationID || w.body.correlationID,
        valor: w.body.charge?.value || w.body.value
    }));
    
    res.json({
        status: 'online',
        webhooks_armazenados: webhooks.length,
        webhooks_resumo: resumo.slice(-20), // últimos 20
        arquivo_existe: fs.existsSync(WEBHOOKS_FILE),
        arquivo_tamanho: fs.existsSync(WEBHOOKS_FILE) ? fs.statSync(WEBHOOKS_FILE).size : 0
    });
});

// Rota para testar (simula um webhook)
app.post('/testar', (req, res) => {
    const webhookTeste = {
        event: "OPENPIX:CHARGE_COMPLETED",
        charge: {
            correlationID: "DEP_1_" + Date.now() + "_test",
            value: 100,
            status: "COMPLETED"
        }
    };
    
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
    console.log(`\n📌 ROTAS DISPONÍVEIS:`);
    console.log(`   🔍 GET  /consultar-webhooks          - Consultar SEM remover`);
    console.log(`   📤 GET  /get-webhooks                 - Buscar (NÃO remove)`);
    console.log(`   ⚠️ GET  /get-webhooks?confirmar=true  - Buscar E REMOVER todos`);
    console.log(`   ✅ POST /confirmar-processamento      - Remover índices específicos`);
    console.log(`   ❌ POST /remover-por-correlationid    - Remover por correlationID`);
    console.log(`   📊 GET  /status                        - Ver status completo`);
    console.log(`   🧪 POST /testar                        - Adicionar webhook de teste`);
    console.log(`   📬 POST /webhook                        - Receber webhooks da Woovi`);
});
