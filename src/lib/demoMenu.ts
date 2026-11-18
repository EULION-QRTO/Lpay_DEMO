// 데모 매장 메뉴판 — 백엔드 menu-board 응답과 같은 모양의 고정 데이터.
// 사진은 이모지로 만든 SVG(data URI)라 별도 이미지 파일이 필요 없다.
import type { MenuBoardResponse, MenuResponse } from './dto'
import waterImg from '../assets/water.png'
import spoonImg from '../assets/spoon.png'

export const DEMO_STORE_NAME = '어흥주막'
export const DEMO_TABLE_NAME = '1'

function emojiImage(emoji: string, bg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="174" height="174" viewBox="0 0 174 174">` +
    `<rect width="174" height="174" fill="${bg}"/>` +
    `<text x="87" y="87" font-size="88" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const NOW = '2026-01-01T00:00:00.000'

function menu(
  id: number,
  categoryId: number,
  name: string,
  price: number,
  description: string,
  imageUrl: string,
  soldOut = false,
): MenuResponse {
  return {
    id,
    storeId: 1,
    categoryId,
    name,
    price,
    description,
    imageUrl,
    soldOut,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

export const DEMO_MENU_BOARD: MenuBoardResponse = {
  categories: [
    {
      categoryId: 1,
      categoryName: '메뉴',
      sortOrder: 1,
      menus: [
        menu(101, 1, '오징어 튀김', 12000, '바삭하게 튀겨낸 통오징어 튀김. 칠리소스와 함께 나가요.', emojiImage('🦑', '#ffe9d6')),
        menu(102, 1, '치즈 감자튀김', 9000, '모짜렐라 치즈를 듬뿍 올린 감자튀김.', emojiImage('🍟', '#fff3c4')),
        menu(103, 1, '어묵탕', 11000, '시원한 무와 어묵이 가득한 국물 안주.', emojiImage('🍢', '#e4f1ff')),
        menu(104, 1, '두부김치', 13000, '볶은 김치와 부드러운 두부, 돼지고기 한 접시.', emojiImage('🥘', '#ffe0e0')),
        menu(105, 1, '계란말이', 8000, '부드럽게 말아낸 두툼한 계란말이.', emojiImage('🍳', '#fff6d6')),
        menu(106, 1, '모둠 소시지', 14000, '소시지 4종 모둠 구이.', emojiImage('🌭', '#ffe5d0')),
        menu(107, 1, '불닭 볶음면', 7000, '매콤한 불닭 소스 볶음면.', emojiImage('🍜', '#ffd9d0'), true),
      ],
    },
    {
      categoryId: 2,
      categoryName: '주류/음료',
      sortOrder: 2,
      menus: [
        menu(201, 2, '소주', 5000, '참이슬 / 처음처럼 중 선택해서 말씀해 주세요.', emojiImage('🍶', '#e6f4ea')),
        menu(202, 2, '맥주', 5000, '시원한 생맥주 500cc.', emojiImage('🍺', '#fff0c2')),
        menu(203, 2, '콜라', 2000, '코카콜라 355ml.', emojiImage('🥤', '#ffdede')),
        menu(204, 2, '사이다', 2000, '칠성사이다 355ml.', emojiImage('🧃', '#e0f7f1')),
        menu(205, 2, '물', 1000, '시원한 생수 500ml.', waterImg),
        menu(206, 2, '수저 세트', 1000, '수저와 젓가락 한 벌.', spoonImg),
      ],
    },
  ],
}

export const findMenu = (id: number): MenuResponse | undefined =>
  DEMO_MENU_BOARD.categories.flatMap((c) => c.menus).find((m) => m.id === id)
