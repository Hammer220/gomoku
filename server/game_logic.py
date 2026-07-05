def check_win(board, row, col, player):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for d in [1, -1]:
            r, c = row + dr * d, col + dc * d
            while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == player:
                count += 1
                r += dr * d
                c += dc * d
        if count >= 5:
            return True
    return False

def check_forbidden(board, row, col):
    if board[row][col] != 1:
        return {'forbidden': False, 'reason': ''}

    if check_overline(board, row, col):
        return {'forbidden': True, 'reason': '长连禁手（六子及以上）'}

    live_threes = 0
    fours = 0
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]

    for dr, dc in directions:
        line_info = analyze_line(board, row, col, dr, dc)
        if line_info['live_three']:
            live_threes += 1
        if line_info['four']:
            fours += 1

    if live_threes >= 2:
        return {'forbidden': True, 'reason': '三三禁手（同时形成两个活三）'}
    if fours >= 2:
        return {'forbidden': True, 'reason': '四四禁手（同时形成两个四）'}

    return {'forbidden': False, 'reason': ''}

def check_overline(board, row, col):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for i in range(1, 6):
            r, c = row + i * dr, col + i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        for i in range(1, 6):
            r, c = row - i * dr, col - i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        if count >= 6:
            return True
    return False

def analyze_line(board, row, col, dr, dc):
    result = {'live_three': False, 'four': False}
    line = []
    center_index = 0

    for i in range(-4, 5):
        r, c = row + i * dr, col + i * dc
        if not (0 <= r < 15 and 0 <= c < 15):
            line.append(-1)
        else:
            line.append(board[r][c])
        if i == 0:
            center_index = len(line) - 1

    count = 1
    left_empty = 0
    right_empty = 0

    for i in range(center_index - 1, -1, -1):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            left_empty += 1
            break
        else:
            break

    for i in range(center_index + 1, len(line)):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            right_empty += 1
            break
        else:
            break

    if count == 4 and left_empty > 0 and right_empty > 0:
        result['four'] = True
    elif count == 4 and (left_empty > 0 or right_empty > 0):
        result['four'] = True
    elif count == 3 and left_empty > 0 and right_empty > 0:
        result['live_three'] = True

    return result