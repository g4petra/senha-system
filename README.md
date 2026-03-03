# Sistema de Senhas (Queue Management System)

Um sistema completo de gerenciamento de filas e senhas em tempo real, desenvolvido com Node.js e focado em clínicas e atendimentos em geral. Possui painel de chamada, quiosque para emissão de senhas, tela para operadores e suporte nativo a impressão térmica via ESC/POS e reprodução de vídeos.

## 🚀 Funcionalidades

- **Quiosque (Kiosk):** Interface para os clientes gerarem suas senhas (Atendimento Normal ou Preferencial).
- **Painel de Exibição (Display):** Tela para TV exibindo a senha atual, histórico das últimas senhas chamadas e um reprodutor de vídeos (com suporte a upload de novos vídeos).
- **Painel do Operador (Operator):** Área logada/restrita onde os atendentes podem chamar a próxima senha da fila, configurar seu guichê e enviar avisos visuais.
- **Integração com Impressoras Térmicas:** Suporte nativo ao protocolo ESC/POS (via porta Serial/COM) para imprimir os tickets físicos com o número da senha. As configurações da impressora podem ser ajustadas em tempo real pelas APIs.
- **Sincronização em Tempo Real:** Utiliza **Socket.IO** para que os painéis e quiosques reflitam mudanças instantaneamente sem precisar recarregar a página.
- **Persistência:** Banco de dados PostgreSQL garantindo que nenhuma senha seja perdida mesmo com o reinício do servidor.

## 💻 Tecnologias Utilizadas

- **Backend:** Node.js, Express, Socket.IO
- **Banco de Dados:** PostgreSQL (`pg` module)
- **Gerenciamento de Arquivos/Uploads:** Multer (para vídeos promocionais na TV)
- **Impressão Térmica:** `node-escpos`
- **Frontend:** HTML5, Vanilla CSS, JavaScript Puro

## 🛠️ Como Instalar e Rodar

### Pré-requisitos
- Node.js (versão 18 ou superior recomendada)
- Instância do PostgreSQL rodando localmente (ou remota)

### Passo a passo

1. **Clone o projeto ou extraia os arquivos em sua máquina.**

2. **Instale as dependências via NPM:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   Renomeie o arquivo `.env.example` para `.env` (ou crie um novo `.env`) e preencha as credenciais do seu banco de dados:
   ```env
   DATABASE_URL=postgres://seu_usuario:sua_senha@localhost:5432/nome_do_banco
   # Opcional: defina a porta do servidor web
   PORT=3000
   ```

4. **Inicie o servidor:**
   ```bash
   npm start
   ```
   > *Dica:* Na primeira execução, o sistema se encarregará de criar automaticamente todas as tabelas necessárias no banco de dados (`app_state`, `printer_config`, `tickets`).

5. **Acesse as Telas do Sistema:**
   Abra seu navegador e navegue até:
   - **Tela da TV/Painel (Display):** `http://localhost:3000/display.html`
   - **Retirar Senhas (Quiosque):** `http://localhost:3000/kiosk.html`
   - **Painel de Atendimento (Operador):** `http://localhost:3000/operator.html`

## 🖨️ Configuração da Impressora ESC/POS

Por padrão, a impressão térmica é controlada pelas tabelas do sistema na rota `/api/printer-config`. Para definir os padrões (caso o banco não possua a configuração salva), configure também no `.env`:

```env
ESC_POS_ENABLED=1
ESC_POS_PORT=COM3
ESC_POS_BAUD=9600
```
- A porta deve corresponder à porta física mapeada no sistema de onde o servidor Node.js roda, ex: `COM3` ou `COM4` no Windows, ou `/dev/usb/lp0` no Linux.

## 🗂️ Estrutura do Projeto

- `/public`: Contém os arquivos de interface de usuário (HTML/CSS/JS) servidos no front-end e pasta `uploads` para retenção de vídeos.
- `server.js`: O arquivo principal focado em subir o Express, gerenciar websockets (`io`) e as rotas da API REST.
- `db.js`: Gerenciador da pool do PostgreSQL e responsável por aplicar automações como `initDatabase()`.
