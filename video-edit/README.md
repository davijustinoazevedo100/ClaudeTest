# Opus 5.5 vs ChatGPT 6 Astra — edição do vídeo

Edição feita 100% por código de um vídeo falando para a câmera (20s → 22.4s, 1920×1080, 30 fps). Os efeitos seguem **o que é falado** e **as mãos**:

| Tempo | Fala | O que aparece |
|---|---|---|
| 0.0 – 1.4 | (antes da fala) | Abertura: logos do Claude e do ChatGPT entram, o "VS" bate com tremor de tela, "QUAL É MELHOR?", saída com glitch |
| 2.1 | "hoje **lançou**…" | Zoom rápido no rosto |
| 2.9 – 4.4 | "o **Opus 5.5**" | Card "LANÇOU HOJE 🚀" com a logo do Claude |
| 6.1 – 12.8 | "**esse aqui**, o **Opus 5.5**" | Logo do Claude em cima da **mão da direita**, seguindo a mão quadro a quadro (MediaPipe), com a etiqueta "OPUS 5.5" |
| 9.7 – 12.8 | "ou **esse aqui**, o **ChatGPT 6 Astra**" | Logo do ChatGPT em cima da **mão da esquerda**, com a etiqueta "CHATGPT 6 ASTRA" |
| 12.0 | "é **melhor**?" | As duas mãos sobem: "VS" com raios saindo de cada logo, flash, tremor e tela dividida verde/coral |
| 13.6 | "fica comigo" | 👀 e zoom |
| 15.6 | "pra **você**" | Zoom forte |
| 17.2 | "melhor opção de **2026**" | "2026" dourado com 🏆 e sino |
| 19.1 | "pra você **assinar**" | 💳 🤔 com som de caixa registradora |
| 19.9 – 22.4 | — | Tela final: "QUEM VENCE?" + "COMENTA AQUI 👇" |

Também tem: legendas palavra por palavra (Opus em coral, ChatGPT em verde, destaques em dourado), correção de cor, vinheta, nitidez, motion blur nos zooms, limpeza da voz e uma trilha de 120 BPM sintetizada que abaixa sozinha quando você fala, com efeitos sonoros em cada animação.

## Como gerar

```sh
pip install mediapipe opencv-python-headless cairosvg pillow numpy scipy
./build.sh SEU_VIDEO.mp4 saida.mp4      # ~2.5 min
```

`ffmpeg` precisa estar no `PATH`. Os modelos de mão e rosto do MediaPipe são baixados na primeira execução.

## Arquivos

- `words.json`: o que foi falado, com o tempo de cada palavra. Transcrito com Whisper e ajustado à mão. `key` dá nome aos momentos que disparam efeitos, `style` muda a cor na legenda e `br` quebra a legenda.
- `track.json`: posição das mãos e do rosto em cada quadro, gerada por `track.py`.
- `edit.py`: câmera, legendas, logos nas mãos, VS, stickers e tela final.
- `sound.py`: trilha, efeitos sonoros e mixagem com a voz.
- `assets/`: fontes Montserrat e Anton (SIL OFL), emojis [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0) e logos das [lobe-icons](https://github.com/lobehub/lobe-icons). Claude e ChatGPT são marcas da Anthropic e da OpenAI.

O vídeo original e o editado não ficam no repositório (`build/` está no `.gitignore`).
