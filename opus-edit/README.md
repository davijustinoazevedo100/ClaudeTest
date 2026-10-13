# Opus 5.5 — edição com motion graphics

Edição de um vídeo de webcam de 26 s em que **cada gráfico segue o que é falado e os gestos das mãos**.
Saída: 1920×1080, 30 fps, estéreo, H.264.

Nada é feito à mão em um editor de vídeo. Cada quadro é uma função pura do número do quadro, do quadro
original e do rastreamento: `EDIT.renderFrame(ctx, frame, { plate, matte })` em `edit.js`, desenhado em canvas
num Chromium headless.

## O roteiro

| t | Fala | Gráfico |
|---|---|---|
| 0.0 | "A Anthropic acabou de anunciar" | flash + glitch de entrada, selo **URGENTE**, "ANTHROPIC" por trás da cabeça, sublinhado e ondas de transmissão em "anunciar" |
| 3.3 | "que o Opus 5.5" | punch-in no rosto; **OPUS** à esquerda e **5.5** à direita da cabeça (o número conta de 0.0 a 5.5), raios de luz |
| 4.8 | "acaba de ultrapassar o GPT-6" | painel de ranking: o Opus acelera, ultrapassa, troca de posição; carimbo **ULTRAPASSOU!**, coroa |
| 8.7 | "tá vendo esse modelo aqui que tá na minha mão" | holograma 3D (icosfera em wireframe, núcleo, órbitas) rastreado na palma, com etiqueta |
| 11.6 | "eu vou até esticar ele aqui" | o modelo estica entre a palma e a pinça da outra mão, com régua de % ao vivo |
| 14.3 | "e agora vai sumir" | volta elástica pra palma, implode, **puf!** em partículas |
| 15.8 | "e também, cara, o que acontece?" | zoom cômico, linhas de velocidade de mangá, pontos de interrogação |
| 17.8 | "ultrapassou todos os benchmarks" | letreiros correndo por trás da cabeça; categorias ✓ arremessadas das mãos abertas |
| 21.5 | "aqui tá a tela do benchmark" | tela de vidro presa entre as mãos em "L" — os dedos ficam **na frente** da tela |
| 23.8 | "é isso mesmo" | carimbo de check |
| 24.6 | "agora vamos continuar o vídeo?" | selo CONTINUA, barra de progresso, transição em forma de ▶ |

Legendas palavra a palavra o tempo todo, com a palavra falada destacada.
O gráfico de benchmark é **ilustrativo** (sem números) e está marcado assim na tela.

## Como funciona

1. **`analyze.py`** — com MediaPipe, rastreia mãos (21 pontos × 2), rosto e o recorte da pessoa
   (selfie segmenter), a 30 fps. Também gera a placa com correção de cor (denoise, contraste, split teal/laranja) e upscale para 1080p.
2. **`rig.py`** — transforma o rastreamento bruto nos poucos sinais suavizados que os gráficos usam:
   rosto (para os zooms), palma que segura o modelo, pinça que estica, mãos que seguram a tela.
   A palma de baixo durante o "esticar" quase não é detectada, então foi marcada à mão a partir do vídeo (`HOLD_KEYS`).
3. **`edit.js`** — os gráficos, em camadas: placa → gráficos *atrás* da pessoa → pessoa (placa × recorte)
   → gráficos no mundo (seguem a câmera) → HUD na tela → legendas → glitch, flashes e vinheta.
   A câmera virtual faz punch-ins e tremidas nos impactos.
4. **`sound.py`** — voz limpa (passa-alta, redução de ruído, EQ, compressão), trilha sintetizada a 108 BPM
   que abaixa sob a voz e some no "o que acontece?", e um efeito sonoro em cada gráfico.
   O apito do "esticar" segue o comprimento real do esticão, calculado do mesmo rastreamento.
5. **`render.mjs`** — renderiza os 782 quadros em paralelo (Playwright) e o `build.sh` monta o MP4.

As palavras e seus tempos vieram do Parakeet TDT 0.6B v3 (`transcribe.py`) e foram corrigidas à mão.

## Build

O vídeo original não está no repositório (o repositório é público). Coloque-o em `source/input.mp4`.

```sh
npm install
pip install mediapipe opencv-python-headless numpy scipy
./build.sh          # rastreamento → som → quadros → opus-5.5-edit.mp4  (~4 min em 4 núcleos)
```

`ffmpeg` precisa estar no `PATH`. Os modelos do MediaPipe são baixados na primeira vez para `models/`.
Para ver um quadro no navegador: sirva a pasta e abra `index.html?f=400`.

## Arquivos

- `edit.js` — todas as cenas, legendas, câmera e composição
- `analyze.py`, `rig.py` — rastreamento e sinais
- `sound.py` — voz, trilha e efeitos
- `render.mjs`, `index.html`, `build.sh` — renderização
- `transcribe.py` — tempos das palavras (opcional)
- `fonts/` — Anton, Inter, JetBrains Mono e Instrument Serif, todas SIL Open Font License
