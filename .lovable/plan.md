## Diagnóstico

Verifiquei o banco e os logs. As fotos dos 3 profissionais estão salvas no Storage como **`.webp`** (Alan, Pablo) e **`.avif`** (João):

```
e8e4759e...webp
fc25ef0e...webp
e8d5e8d3...avif
```

O WhatsApp Carousel da uazapi só renderiza **JPG/PNG** de forma confiável. Quando passamos a URL `.webp`/`.avif` direto:
- A API uazapi às vezes rejeita o card (carrossel "some")
- Ou aceita mas o WhatsApp do cliente não consegue baixar/exibir a imagem

Por isso, na versão anterior o carrossel parava de enviar quando havia foto. Hoje o `safeImage()` filtra `.webp`/`.avif` e troca por um avatar PNG do `ui-avatars` — o carrossel volta a sair, mas **as fotos reais nunca aparecem**, só as iniciais.

## Causa raiz

Em `src/pages/Professionals.tsx`:

- `handlePhotoSelect` **só comprime/converte** para JPEG quando o arquivo é **maior que 5 MB**.
- Para arquivos menores (a maioria — celular moderno gera `.webp`/`.heic` pequenos), o arquivo é enviado ao Storage com a extensão original.
- `uploadPhoto` usa `photoFile.name.split(".").pop()` como extensão do path, então o objeto vai pro Storage como `<id>.webp` ou `<id>.avif`.

## Mudança proposta

Em `src/pages/Professionals.tsx`, normalizar **toda** foto selecionada para JPEG antes de subir, independente do tamanho:

1. Em `handlePhotoSelect`: sempre passar o arquivo por `compressImage` (que já converte via canvas para `image/jpeg`). Isso garante que o arquivo final tenha sempre `type: "image/jpeg"` e nome com `.jpg`.
2. Em `uploadPhoto`: forçar `const path = '<id>.jpg'` em vez de pegar a extensão do nome (proteção extra).
3. Manter o limite máximo (1200 px / qualidade inicial 0.8) já existente para arquivos grandes.

Resultado: todas as fotos novas vão pro Storage como `.jpg` e o webhook usa a URL real (cai no regex `safeImage` que aceita `.jpe?g`).

## Sobre as 3 fotos já existentes

Elas continuarão `.webp`/`.avif` no Storage. Duas opções:

- **(A)** Pedir pra você reenviar as fotos dos 3 profissionais pela tela de Profissionais — depois da correção, elas viram `.jpg` automaticamente.
- **(B)** Eu adiciono um botão "Reprocessar fotos" que baixa cada uma, converte para JPEG e re-sobe (mais trabalho, só vale se houver muitos profissionais).

Recomendo **(A)** — são só 3 fotos.

## Arquivos alterados

- `src/pages/Professionals.tsx` — `handlePhotoSelect` e `uploadPhoto`

Sem mudanças no backend / edge function.