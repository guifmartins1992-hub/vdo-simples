# V-eet

**V-eet (Virtual Meet)** é o nome de teste da plataforma.

Aplicação web V-eet de salas temporárias para compartilhar a tela e ligar câmeras, sem áudio.

## O que já está implementado
- Tela inicial com criar sala e acessar sala por código.
- Código aleatório de 6 caracteres.
- Qualquer participante pode iniciar uma transmissão; o servidor permite apenas uma por vez.
- Uma guia para transmissão e outra para câmeras.
- Câmeras de vídeo sem microfone.
- Captura de tela sem áudio.
- Sala temporária: quando o anfitrião desconecta, a sala é encerrada para todos.
- Sem banco de dados e sem limite artificial de duração.

## Requisitos
- Node.js 20 ou superior.
- Navegador moderno (Chrome, Edge, Firefox ou Opera).
- HTTPS para uso fora de localhost (necessário para câmera e captura de tela).

## Rodar localmente
```bash
npm install
npm start
```
Acesse http://localhost:3000.

## Publicar
Publique como serviço Node.js em uma hospedagem que mantenha processos WebSocket ativos. Configure a porta pela variável PORT.
A aplicação precisa estar em HTTPS para permitir acesso à câmera e compartilhamento de tela.

## Importante sobre qualidade e escala
Esta primeira versão usa WebRTC em malha (mesh) com um servidor de sinalização Socket.IO e STUN público. É adequada para protótipos e salas pequenas. Em salas com muitos participantes, o tráfego de câmera cresce rapidamente; para uso estável com grupos maiores, substitua a malha por um SFU (por exemplo, LiveKit ou mediasoup) e configure TURN para redes restritas.

O servidor STUN público ajuda a estabelecer conexões, mas não substitui um servidor TURN. Sem TURN, algumas combinações de roteadores/firewalls podem impedir a conexão entre participantes. Para produção, configure TURN e limites de resolução/bitrate conforme a capacidade da hospedagem.

## Limitações desta entrega
- Não há login, senha, gravação, chat ou áudio.
- Os nomes são rótulos padrão ("Anfitrião" e "Participante").
- A sala fica ativa enquanto a conexão do anfitrião permanecer ativa; se ele fechar a guia ou perder a conexão, a sala termina.
- Não existe limite de tempo imposto pelo código, mas a disponibilidade depende da hospedagem e da conexão.
